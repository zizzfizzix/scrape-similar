/**
 * Source shapes that make the coverage numbers wrong, scanned for by
 * `src/__tests__/coverage-hazards.test.ts`.
 *
 * The other two coverage guards watch the measurement: the exclusion list in
 * `coverage-exclusions.ts` keeps code from being dropped from the denominator on
 * purpose, and `scripts/check-coverage-fidelity.mjs` keeps a build-chain bug
 * from dropping it by accident (#268). This one watches the *source*, because a
 * file can be fully instrumented and still be counted wrong.
 *
 * ## The hazard: `await` in a conditionally-evaluated expression
 *
 * V8's block coverage counts the code after an `await` as part of the block that
 * resumed it. When the `await` sits somewhere that only runs on one side of a
 * branch — the right of `||`, `&&` or `??`, or an arm of `?:` — that block is
 * the branch, so *everything after it in the same function* inherits the
 * branch's count instead of the function's:
 *
 * ```ts
 * const debug = isDevOrTest || !!(await storage.getItem('local:debugMode')) // ← awaited only when !isDevOrTest
 * init({ debug })                                                          // ran 4×, counted 2×
 * if (!isDevOrTest) { ... }                                                // ran 4×, counted 2×
 * ```
 *
 * Measured on the real thing (`posthog-background.ts`, four scenarios, two of
 * them dev/test): every statement after the `await` reported 2 executions
 * instead of 4, and the `if` reported its consequent taken twice out of a parent
 * count of two — so the arm that skips the watcher, which two of the four
 * scenarios genuinely take, came out as never taken. Where the `await` never
 * runs at all the same shape reports the rest of the function as dead code.
 *
 * That is what #272 hit. The ticket blamed one test file's data being evicted by
 * another's, because the symptom moved when test files were added or removed —
 * but the counts move for the mundane reason that the mix of scenarios in a run
 * changes which branch the `await` is attributed to. A single test file
 * reproduces it, and the workaround the ticket describes (giving the `if` an
 * explicit `else` so both arms are real blocks with their own counts, rather
 * than one being derived as parent − consequent) only hid the branch half of it;
 * the statement counts stayed wrong.
 *
 * ## The rule
 *
 * Await on its own line and use the result in the expression. It is a
 * mechanical change, it reads better than an `await` buried in an options
 * object, and it makes the counts right.
 *
 * Only `await` is flagged. `yield` has the same shape, but this codebase has no
 * generators, so a rule about them would be untested here.
 */

import { parse } from '@babel/parser'

export interface ConditionalAwait {
  line: number
  column: number
  /** Where the `await` sits, phrased for the failure message. */
  branch: string
}

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'FunctionDeclaration',
  'FunctionExpression',
  'ObjectMethod',
])

interface Node {
  type: string
  loc?: { start: { line: number; column: number } }
  [key: string]: unknown
}

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

/**
 * Finds every `await` that only runs on one side of a branch within its own
 * function. A nested function starts fresh: its body runs when it is called, not
 * when the branch around its definition is taken.
 */
export const findConditionalAwaits = (code: string, filePath: string): ConditionalAwait[] => {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: filePath.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
  })

  const found: ConditionalAwait[] = []

  const walk = (value: unknown, branch: string | null): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, branch)
      return
    }
    if (!isNode(value)) return

    if (value.type === 'AwaitExpression' && branch !== null) {
      const start = value.loc?.start
      found.push({
        // Babel counts lines from 1 and columns from 0; both are reported the
        // way an editor addresses them.
        line: start ? start.line : 0,
        column: start ? start.column + 1 : 0,
        branch,
      })
    }

    const inherited = FUNCTION_TYPES.has(value.type) ? null : branch

    if (value.type === 'LogicalExpression') {
      walk(value.left, inherited)
      walk(value.right, `the right-hand side of \`${String(value.operator)}\``)
      return
    }
    if (value.type === 'ConditionalExpression') {
      walk(value.test, inherited)
      walk(value.consequent, 'an arm of `?:`')
      walk(value.alternate, 'an arm of `?:`')
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'loc') continue
      walk(child, inherited)
    }
  }

  walk(ast.program, null)

  return found
}
