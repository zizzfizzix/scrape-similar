import type { Rule } from 'eslint'

/**
 * Bans the source shape that makes v8 count a function wrong.
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
const DOCUMENTATION =
  'https://github.com/zizzfizzix/scrape-similar/blob/main/tools/eslint-rules/no-conditional-await.ts'

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
])

/**
 * A nested function starts fresh: its body runs when it is called, not when the
 * branch around its definition is taken.
 */
const branchAround = (node: Rule.Node): string | null => {
  let child: Rule.Node = node
  let parent: Rule.Node | null = node.parent

  while (parent !== null && !FUNCTION_TYPES.has(parent.type)) {
    if (parent.type === 'LogicalExpression' && parent.right === child) {
      return `the right-hand side of \`${parent.operator}\``
    }
    if (
      parent.type === 'ConditionalExpression' &&
      (parent.consequent === child || parent.alternate === child)
    ) {
      return 'an arm of `?:`'
    }

    child = parent
    parent = parent.parent
  }

  return null
}

export const noConditionalAwait: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow `await` in a position only one side of a branch reaches',
      url: DOCUMENTATION,
    },
    schema: [],
    messages: {
      conditionalAwait:
        'This `await` sits on {{branch}}, so v8 counts the rest of the function as if it only ran ' +
        'on that branch (#272). Await on its own line and use the result in the expression.',
    },
  },
  create: (context) => ({
    AwaitExpression: (node) => {
      const branch = branchAround(node)

      if (branch !== null) {
        context.report({ node, messageId: 'conditionalAwait', data: { branch } })
      }
    },
  }),
}
