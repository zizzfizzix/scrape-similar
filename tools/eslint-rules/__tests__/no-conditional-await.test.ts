import { noConditionalAwait } from '@@/tools/eslint-rules/no-conditional-await.ts'
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'

/**
 * The cases the hand-rolled scan in `coverage-hazards.ts` carried before this
 * rule replaced it (#7), plus the ones ESTree shapes differently from Babel.
 */
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 'latest' } },
})

ruleTester.run('no-conditional-await', noConditionalAwait, {
  valid: [
    'const a = async () => {\n  const y = await z()\n  return x || y\n}',
    'const a = async () => (await y()) || x',
    'const a = async () => ((await y()) ? 1 : 2)',
    // A statement-level branch gets a block of its own, so it is exempt.
    'const a = async () => {\n  if (x) {\n    await y()\n  }\n}',
    'const a = async () => {\n  for (const v of xs) {\n    await y(v)\n  }\n}',
    // A nested function's body runs when it is called, not when the branch
    // around its definition is taken.
    'const a = () => x || (async () => await y())',
    'const a = () => x || { async m() {\n  await y()\n} }',
    'const a = () => x || class { async m() { await y() } }',
    'const a = <T,>(v: T): T => v',
  ],
  invalid: [
    {
      code: 'const a = async () => x || (await y())',
      errors: [{ messageId: 'conditionalAwait', data: { branch: 'the right-hand side of `||`' } }],
    },
    {
      code: 'const a = async () => x && (await y())',
      errors: [{ messageId: 'conditionalAwait', data: { branch: 'the right-hand side of `&&`' } }],
    },
    {
      code: 'const a = async () => x ?? (await y())',
      errors: [{ messageId: 'conditionalAwait', data: { branch: 'the right-hand side of `??`' } }],
    },
    {
      code: 'const a = async () => (x ? await y() : await z())',
      errors: [
        { messageId: 'conditionalAwait', data: { branch: 'an arm of `?:`' } },
        { messageId: 'conditionalAwait', data: { branch: 'an arm of `?:`' } },
      ],
    },
    {
      // Reported against the branch nearest the `await`, not the outermost one.
      code: 'const a = async () => x || (w && (await y()))',
      errors: [{ messageId: 'conditionalAwait', data: { branch: 'the right-hand side of `&&`' } }],
    },
    {
      // The statement the `await` sits in does not end the search.
      code: 'const a = async () => {\n  const v = x || (await y())\n  return v\n}',
      errors: [{ messageId: 'conditionalAwait', data: { branch: 'the right-hand side of `||`' } }],
    },
  ],
})
