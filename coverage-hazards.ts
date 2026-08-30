/**
 * The source shape that makes v8 count a function wrong, scanned for by
 * `src/__tests__/coverage-hazards.test.ts`.
 *
 * V8 counts the code after an `await` as part of the block that resumed it. An
 * `await` that only runs on one side of a branch — the right of `||`, `&&` or
 * `??`, or an arm of `?:` — puts the rest of the function in that branch's
 * block, so every statement after it inherits the branch's count instead of the
 * function's:
 *
 * ```ts
 * const debug = isDevOrTest || !!(await storage.getItem('local:debugMode')) // awaited only when !isDevOrTest
 * init({ debug })                                                          // ran 4x, counted 2x
 * if (!isDevOrTest) { ... }                                                // ran 4x, counted 2x
 * ```
 *
 * The `if` then has a consequent count equal to its parent count, and the arm
 * v8-to-istanbul derives as parent − consequent collapses to zero — a branch two
 * of those four scenarios genuinely take, reported as never taken. Where the
 * `await` never runs at all, the rest of the function reports as dead.
 *
 * That is #272, measured on `posthog-background.ts`. The ticket blamed one test
 * file's coverage being evicted by another's, because the symptom moved as test
 * files were added — but the counts move because the mix of scenarios changes
 * which branch the `await` is attributed to, and one file on its own reproduces
 * it. The workaround it describes (an explicit `else`, so both arms are real
 * blocks rather than one derived) only hid the branch half of it; the statement
 * counts stayed wrong.
 *
 * The fix is to await on its own line and use the result in the expression. A
 * branch that is a statement (`if`, a loop body) is fine: v8 gives it a block of
 * its own, so the code after it keeps the function's count.
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
 * A nested function starts fresh: its body runs when it is called, not when the
 * branch around its definition is taken.
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
        line: start ? start.line : 0,
        // Babel columns are 0-based; editors address them from 1.
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
