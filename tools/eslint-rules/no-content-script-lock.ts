import type { Rule } from 'eslint'
import path from 'node:path'
import ts from 'typescript'

/**
 * Bans a content script from reaching a Web Lock, directly or through any chain
 * of project functions (#345).
 *
 * Extension pages and the background share one lock manager, which is what
 * `withStorageLock` serialises storage writers on. A content script gets the
 * lock manager of the page it runs in instead, so a lock it takes:
 *
 * - does not serialise against the extension, and concurrent read-modify-writes
 *   lose updates without an error;
 * - shares its name with the page's own locks on an https page, where a page
 *   script holding `local:event_queue` stalls the write until it times out;
 * - does not exist on an http page, where `navigator.locks` is undefined.
 *
 * `no-restricted-imports` cannot hold this. WXT auto-imports every export of
 * `src/utils`, so a content script calls `queueEvent` without importing it, and
 * the lock sits several calls below the helper the content script names
 * (`savePreset` → `updateStorageItem` → `withStorageLock`). The rule instead
 * resolves every identifier in a content script to its declaration and walks
 * the declarations it references, across modules, until it reaches
 * `LockManager` or runs out of project code.
 *
 * The walk sees references, not control flow, so a function that takes a lock
 * only outside a content script reads as taking it everywhere. Those are listed
 * in the `boundaries` option, each with the reason the content-script path is
 * lock-free; the walk does not enter them.
 *
 * The walk starts from what a content script references, so a statement that
 * runs at the top level of a module it imports is not followed.
 */
const DOCUMENTATION =
  'https://github.com/zizzfizzix/scrape-similar/blob/main/tools/eslint-rules/no-content-script-lock.ts'

interface Boundary {
  /**
   * Absolute path of the declaring module. A relative one resolves against
   * ESLint's working directory, which an editor may set below the repo root.
   */
  module: string
  name: string
  reason: string
}

interface Options {
  boundaries?: Boundary[]
}

interface TypedParserServices {
  program: ts.Program
  esTreeNodeToTSNodeMap: { get: (node: unknown) => ts.Node }
}

/** `null`: the symbol reaches no lock. Otherwise the names from it down to the lock. */
type Chain = string[] | null

const TYPE_ONLY = ts.SymbolFlags.Type & ~ts.SymbolFlags.Value

const IMPORT_SPECIFIERS = new Set([
  'ImportSpecifier',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
])

const RUNTIME_TS_NODES = new Set([
  'TSAsExpression',
  'TSEnumBody',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSExportAssignment',
  'TSInstantiationExpression',
  'TSModuleBlock',
  'TSModuleDeclaration',
  'TSNonNullExpression',
  'TSParameterProperty',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

const TS_EXPRESSION_WRAPPERS = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

const isExpressionWrapper = (node: unknown): node is { expression: unknown } =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  typeof node.type === 'string' &&
  TS_EXPRESSION_WRAPPERS.has(node.type) &&
  'expression' in node

const unwrapExpression = (node: unknown): unknown => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

/** The fields `check` reads from an identifier's parent, whatever its type. */
interface LooseNode {
  type: string
  key?: unknown
  object?: object
  parent?: { type: string } | null
  property?: unknown
  shorthand?: boolean
}

const isWithin = (inner: ts.Node, outer: ts.Node): boolean =>
  inner.getSourceFile() === outer.getSourceFile() &&
  inner.pos >= outer.pos &&
  inner.end <= outer.end

const isLockManagerDeclaration = (declaration: ts.Node): boolean =>
  ts.isInterfaceDeclaration(declaration) && declaration.name.text === 'LockManager'

// A type that names a function (`typeof saveThing`) runs nothing. `f<T>` with
// no call is an `ExpressionWithTypeArguments`, which TS counts as a type node.
const forEachIdentifier = (node: ts.Node, visit: (identifier: ts.Identifier) => void): void => {
  if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return
  if (ts.isIdentifier(node)) visit(node)
  ts.forEachChild(node, (child) => forEachIdentifier(child, visit))
}

const isInType = (node: Rule.Node): boolean => {
  for (let current: Rule.Node | null = node.parent; current; current = current.parent) {
    // ESTree's own node types and the TS ones share the field; every TS type
    // context is a `TS…` node, and no runtime one is except these wrappers.
    const type: string = current.type
    if (type.startsWith('TS') && !RUNTIME_TS_NODES.has(type)) return true
  }
  return false
}

export const noContentScriptLock: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow a content script from reaching a Web Lock',
      url: DOCUMENTATION,
    },
    schema: [
      {
        type: 'object',
        properties: {
          boundaries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                module: { type: 'string' },
                name: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['module', 'name', 'reason'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      reachesLock:
        '`{{name}}` takes a Web Lock ({{chain}}). A content script gets the lock manager of the ' +
        'page it runs in, so the lock does not serialise against the extension. Message the ' +
        'background and let it do the write.',
    },
  },
  create: (context) => {
    const services = context.sourceCode.parserServices as Partial<TypedParserServices> | undefined
    if (!services?.program || !services.esTreeNodeToTSNodeMap) {
      throw new Error(
        'no-content-script-lock needs type information (parserOptions.projectService)',
      )
    }
    const { program, esTreeNodeToTSNodeMap } = services
    const checker = program.getTypeChecker()
    const [options = {}] = context.options as [Options?]
    const boundaries = new Set(
      (options.boundaries ?? []).map(
        (boundary) => `${path.resolve(context.cwd, boundary.module)}#${boundary.name}`,
      ),
    )

    const resolveAlias = (symbol: ts.Symbol): ts.Symbol =>
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

    /**
     * The name an identifier refers to. In `{ saveThing }` the checker answers
     * with the property the shorthand declares, not the value it holds; in
     * `const { saveThing } = ns` it answers with the new local binding, not
     * the property of `ns` it is read from.
     */
    const symbolAt = (identifier: ts.Node): ts.Symbol | undefined => {
      const { parent } = identifier
      let symbol: ts.Symbol | undefined
      if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
        symbol = checker.getShorthandAssignmentValueSymbol(parent)
      } else if (
        ts.isBindingElement(parent) &&
        parent.name === identifier &&
        ts.isObjectBindingPattern(parent.parent)
      ) {
        const property = parent.propertyName ?? identifier
        const name = ts.isIdentifier(property) ? property.text : property.getText()
        symbol = checker.getTypeAtLocation(parent.parent).getProperty(name)
      } else {
        symbol = checker.getSymbolAtLocation(identifier)
      }
      return symbol && resolveAlias(symbol)
    }

    /**
     * WXT declares an auto-import as `const x: typeof import('/abs/path').x` in
     * a `.d.ts`; the qualifier of that import type names the real export.
     */
    const throughAmbient = (symbol: ts.Symbol): ts.Symbol | undefined => {
      const declaration = symbol.valueDeclaration
      const type =
        declaration && ts.isVariableDeclaration(declaration) ? declaration.type : undefined
      if (!type || !ts.isImportTypeNode(type) || !type.qualifier) return undefined
      const { qualifier } = type
      return symbolAt(ts.isQualifiedName(qualifier) ? qualifier.right : qualifier)
    }

    const chains = new Map<ts.Symbol, Chain>()
    const inProgress = new Set<ts.Symbol>()
    // A result computed while the walk was cut short by a cycle may be missing
    // the path through the symbol in progress, so it is not cached.
    let cycleHits = 0

    const chainFrom = (start: ts.Symbol): Chain => {
      const symbol = resolveAlias(start)
      const cached = chains.get(symbol)
      if (cached !== undefined) return cached
      if (inProgress.has(symbol)) {
        cycleHits++
        return null
      }

      const declarations = symbol.declarations ?? []
      const [first] = declarations
      // A module namespace is not walked whole; `ns.member` resolves the member.
      if (!first || ts.isSourceFile(first) || (symbol.flags & ~TYPE_ONLY) === 0) {
        return null
      }

      const sourceFile = first.getSourceFile()
      if (program.isSourceFileDefaultLibrary(sourceFile)) {
        // `navigator.locks`, or a `LockManager` method reached some other way
        // (`const { locks } = navigator`, `navigator['locks']`).
        const isLockManager =
          symbol.name === 'LockManager' ||
          checker.getTypeOfSymbol(symbol).getSymbol()?.name === 'LockManager' ||
          declarations.some((d) => isLockManagerDeclaration(d.parent))
        return isLockManager ? [symbol.name] : null
      }
      if (
        program.isSourceFileFromExternalLibrary(sourceFile) ||
        sourceFile.fileName.includes('/node_modules/') ||
        boundaries.has(`${path.resolve(sourceFile.fileName)}#${symbol.name}`)
      ) {
        return null
      }

      const hitsBefore = cycleHits
      inProgress.add(symbol)
      let chain: Chain = null

      if (sourceFile.isDeclarationFile) {
        const target = throughAmbient(symbol)
        chain = target && target !== symbol ? chainFrom(target) : null
      } else {
        for (const declaration of declarations) {
          forEachIdentifier(declaration, (identifier) => {
            if (chain) return
            const resolved = symbolAt(identifier)
            if (!resolved) return
            // Parameters and locals are walked as part of the declaration
            // they sit in.
            if (resolved.declarations?.every((d) => isWithin(d, declaration))) return
            const rest = chainFrom(resolved)
            if (rest) chain = [symbol.name, ...rest]
          })
          if (chain) break
        }
      }

      inProgress.delete(symbol)
      if (chain || cycleHits === hitsBefore) chains.set(symbol, chain)
      return chain
    }

    // ESLint visits a member expression's object before its property, so
    // `navigator.locks.query()` is reported once, at `locks`.
    const reported = new WeakSet<object>()

    const check = (node: Rule.Node & { name: string }): void => {
      // An identifier is never the Program node, the only one without a parent.
      const parent: LooseNode = node.parent!
      if (IMPORT_SPECIFIERS.has(parent.type) || isInType(node)) return
      // `<Saver></Saver>` is reported at its opening tag.
      if (parent.type === 'JSXClosingElement') return
      if (
        (parent.type === 'MemberExpression' || parent.type === 'JSXMemberExpression') &&
        parent.property === node
      ) {
        // `navigator.locks!.query()`: the wrapper sits between the two names.
        const object = unwrapExpression(parent.object)
        const last: unknown =
          typeof object === 'object' && object !== null && 'property' in object
            ? object.property
            : object
        if (typeof last === 'object' && last !== null && reported.has(last)) return
      }
      // A property key in `{ saveThing }` or `{ saveThing: save } = ns` names
      // what the value node resolves; the value is checked.
      if (parent.type === 'Property' && parent.key === node) {
        if (parent.shorthand === true || parent.parent?.type === 'ObjectPattern') return
      }
      const resolved = symbolAt(esTreeNodeToTSNodeMap.get(node))
      if (!resolved) return
      // A local declaration's body is linted here too, so the identifiers
      // inside it are reported where they appear.
      if (resolved.declarations?.every((d) => d.getSourceFile().fileName === context.filename)) {
        return
      }
      const chain = chainFrom(resolved)
      if (chain) {
        reported.add(node)
        context.report({
          node,
          messageId: 'reachesLock',
          data: { name: node.name, chain: chain.join(' → ') },
        })
      }
    }

    return {
      Identifier: check,
      // A component rendered as `<Banner />` is referenced by its tag name.
      JSXIdentifier: check,
    }
  },
}
