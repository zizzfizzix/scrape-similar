import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import type { Linter } from 'eslint'
import jestDom from 'eslint-plugin-jest-dom'
import reactHooks from 'eslint-plugin-react-hooks'
import testingLibrary from 'eslint-plugin-testing-library'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import {
  BOOTSTRAP_EXCLUSIONS,
  BOOTSTRAP_LINE_BUDGET,
  COVERAGE_EXCLUSIONS,
} from './coverage-exclusions.ts'
import { noConditionalAwait } from './tools/eslint-rules/no-conditional-await.ts'

/**
 * Prettier owns formatting; this file owns the conventions in `CLAUDE.md` that
 * were enforced by review or by a hand-rolled test until #7.
 *
 * Running it against `typescript@7` takes one indirection. TS 7 ships no JS
 * compiler API, so typescript-eslint cannot parse with it: `typescript` is
 * aliased to `@typescript/typescript6` in `package.json` for the linter, while
 * the TS 7 compiler — installed under the `typescript7` alias, and the only
 * thing `pnpm compile` runs — keeps the `tsc` name. Neither package shadows the
 * other's binary. See the README for when that indirection can come out.
 *
 * Type-aware linting is switched on (`projectService`). The typed rules that are
 * on are the ones this codebase already passes (ALREADY_CLEAN) plus the boolean
 * naming rule; the rest are staged in DEFERRED below with the violation count
 * each one has today.
 */

const TEST_FILES = ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'vitest.setup.ts']

const NO_ENUM = {
  selector: 'TSEnumDeclaration',
  message: 'Use a const object with `as const` plus a derived union type instead of an enum.',
}

const NO_DEFAULT_EXPORT = {
  selector: 'ExportDefaultDeclaration',
  message:
    'Export components and functions by name. Only files a tool reads a default export from are exempt.',
}

const NO_INNER_HTML = {
  selector: "AssignmentExpression[left.property.name='innerHTML']",
  message:
    'Assigning `innerHTML` runs markup from the page. Build nodes and set `textContent` instead.',
}

interface RestrictedSelector {
  selector: string
  message: string
}

/** The rule takes one list per file, so each scope restates the ones it keeps. */
const restrictedSyntax = (
  ...selectors: RestrictedSelector[]
): { 'no-restricted-syntax': ['error', ...RestrictedSelector[]] } => ({
  'no-restricted-syntax': ['error', ...selectors],
})

/**
 * Typed rules from `strictTypeChecked` and `stylisticTypeChecked` that this
 * codebase already satisfies, so they cost nothing to switch on and only ever
 * fail on something new. Kept as an explicit list rather than by extending
 * those two configs, because the rest of them is a backlog rather than a
 * decision — see #282 for the ladder and what each remaining rule would cost.
 *
 * Rules that cannot fire here are left out rather than listed: the enum and
 * class ones (both banned by convention) and `ban-tslint-comment`.
 */
const ALREADY_CLEAN: Linter.RulesRecord = {
  '@typescript-eslint/consistent-generic-constructors': 'error',
  '@typescript-eslint/consistent-type-assertions': 'error',
  '@typescript-eslint/dot-notation': 'error',
  '@typescript-eslint/no-array-delete': 'error',
  // `${obj}` where `obj` has no useful `toString` — "[object Object]" in a log
  // line or, worse, in an exported cell.
  '@typescript-eslint/no-base-to-string': 'error',
  '@typescript-eslint/no-confusing-non-null-assertion': 'error',
  // Fires when a dependency marks something `@deprecated`, which is the only
  // warning WXT or Radix gives before removing it.
  '@typescript-eslint/no-deprecated': 'error',
  '@typescript-eslint/no-duplicate-type-constituents': 'error',
  '@typescript-eslint/no-dynamic-delete': 'error',
  '@typescript-eslint/no-for-in-array': 'error',
  // The `eval` ban in CLAUDE.md, for the spellings `no-eval` does not see.
  '@typescript-eslint/no-implied-eval': 'error',
  '@typescript-eslint/no-meaningless-void-operator': 'error',
  '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
  '@typescript-eslint/no-redundant-type-constituents': 'error',
  '@typescript-eslint/no-unnecessary-type-arguments': 'error',
  '@typescript-eslint/no-unsafe-unary-minus': 'error',
  '@typescript-eslint/prefer-find': 'error',
  '@typescript-eslint/prefer-for-of': 'error',
  '@typescript-eslint/prefer-function-type': 'error',
  '@typescript-eslint/prefer-includes': 'error',
  '@typescript-eslint/prefer-reduce-type-parameter': 'error',
  '@typescript-eslint/prefer-string-starts-ends-with': 'error',
  // The option `strictTypeChecked` uses: flag only the `return await` that
  // changes error handling, not the one that is merely redundant.
  '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
  '@typescript-eslint/unified-signatures': 'error',
}

/**
 * CLAUDE.md's boolean prefix row (#284).
 *
 * The `filter` exempts `ConsentState`, which is `boolean | undefined` where
 * `undefined` means "not asked yet". `naming-convention` strips `null` and
 * `undefined` from a type before checking it (`getNonNullableType()`), so it
 * reads that tri-state as a boolean and no option says otherwise — and a prefix
 * would promise two states where there are three. Variables holding one are
 * named `…consentState` so this line can find them.
 *
 * The selector stays at `variable`. Widening it to properties reports 537, led
 * by `success` 259 times: the `MessageResponse` envelope, a cross-context
 * contract rather than a name to fix. `parameter` reports 46, mostly props.
 * CLAUDE.md's other naming rows do not want a selector either — casing reports
 * 69, of which 67 are React components that have to be allowed `PascalCase`
 * anyway, and `naming-convention` never sees a filename, so the directory row
 * would take `check-file` or `unicorn/filename-case`.
 */
const BOOLEAN_PREFIX: Linter.RulesRecord = {
  '@typescript-eslint/naming-convention': [
    'error',
    {
      selector: 'variable',
      types: ['boolean'],
      format: ['PascalCase'],
      prefix: ['is', 'has', 'should', 'can', 'was', 'will'],
      filter: { regex: '[Cc]onsentState$', match: false },
    },
  ],
}

/**
 * Rules worth having that no longer fit in the diff that turned the linter on.
 * Each is off with the number of violations it reports today, so re-enabling one
 * is a line here plus the fixes it names — and so the count is a claim a reviewer
 * can check rather than an impression. See #7.
 */
const DEFERRED = {
  // 128, of which 65 are `trackEvent` — analytics calls that swallow their own
  // errors, so the fix is one signature rather than 65 `void`s.
  '@typescript-eslint/no-floating-promises': 'off',
  // 35, nearly all `onClick={async () => …}`.
  '@typescript-eslint/no-misused-promises': 'off',
  // 74: 28 in extension code, mostly the message-passing types, and 46 in unit
  // and e2e test scaffolding.
  '@typescript-eslint/no-explicit-any': 'off',
  // 265. The component tests reach into `container` deliberately; the rule wants
  // them rewritten onto queries, which is a rewrite of the suite, not a fix.
  'testing-library/no-node-access': 'off',
  // 38. CLAUDE.md's "never nest `act` around `user-event`" is this rule, but the
  // mount-time `await act(async () => {})` in the local `render` helpers reads
  // the same to it, so the two need separating first.
  'testing-library/no-unnecessary-act': 'off',
  // 37, all naming (`view` / `mounted` rather than `view = render()`).
  'testing-library/render-result-naming-convention': 'off',
  // 106 and 21, both off because their fixes do not say the same thing as the
  // assertions they replace. `toHaveTextContent` matches a substring, so it
  // weakens every `expect(el.textContent).toBe(x)` it rewrites; `toHaveStyle`
  // cannot express "this declaration is not set", which 7 of the 21 sites
  // assert. Both fixers also mangle `expect((el as HTMLElement).…)` into
  // unparseable code.
  'jest-dom/prefer-to-have-text-content': 'off',
  'jest-dom/prefer-to-have-style': 'off',
  // 22 between them, and every one is an effect to restructure rather than a
  // line to change: a `setState` on mount that wants `useSyncExternalStore`, a
  // `[]` dependency list that would loop if it were completed. The React
  // Compiler rules around them (`rules-of-hooks`, `purity`, `refs`,
  // `set-state-in-render`, …) are on and clean.
  'react-hooks/set-state-in-effect': 'off',
  'react-hooks/exhaustive-deps': 'off',
  'react-hooks/immutability': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
} as const

export default defineConfig([
  globalIgnores([
    '.output/**',
    '.wxt/**',
    'coverage/**',
    'test-results/**',
    // Regenerated by `pnpm update:shadcn`, so a fix here would not survive.
    'src/components/ui/**',
  ]),

  { files: ['**/*.{ts,tsx,mjs}'], extends: [js.configs.recommended] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'chrome',
          message:
            "Use WXT's auto-imported `browser`, which is typed and works on Chromium, Firefox and Edge.",
        },
      ],
      ...restrictedSyntax(NO_ENUM, NO_DEFAULT_EXPORT),
      // `== null` is the deliberate "null or undefined" check; everything else
      // compares by identity.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      ...ALREADY_CLEAN,
      ...BOOLEAN_PREFIX,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    },
  },

  { files: ['src/**/*.{ts,tsx}'], extends: [reactHooks.configs.flat.recommended] },

  {
    // Extension code only: a test emptying a container it built itself is not
    // what the rule is about.
    files: ['src/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: restrictedSyntax(NO_ENUM, NO_DEFAULT_EXPORT, NO_INNER_HTML),
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [...COVERAGE_EXCLUSIONS, ...TEST_FILES],
    plugins: { coverage: { rules: { 'no-conditional-await': noConditionalAwait } } },
    rules: { 'coverage/no-conditional-await': 'error' },
  },

  {
    files: BOOTSTRAP_EXCLUSIONS,
    // Past this a bootstrap file has stopped being wiring, and whatever it has
    // grown is unmeasured: `coverage-exclusions.ts` leaves these out of the
    // coverage gate.
    rules: { 'max-lines': ['error', { max: BOOTSTRAP_LINE_BUDGET }] },
  },

  {
    files: ['src/entrypoints/*/index.ts'],
    rules: restrictedSyntax(NO_ENUM, NO_INNER_HTML),
  },

  {
    files: ['*.config.{ts,js}', 'eslint.config.ts'],
    rules: restrictedSyntax(NO_ENUM),
  },

  {
    files: TEST_FILES,
    extends: [
      vitest.configs.recommended,
      testingLibrary.configs['flat/react'],
      jestDom.configs['flat/recommended'],
    ],
    rules: {
      // Vitest's `expect` takes an optional message as its second argument, and
      // these tests use it to say which case failed.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      // A test whose assertion sits in a helper still asserts.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*', 'waitFor*'] }],
    },
  },

  {
    files: ['tests/e2e/**/*.ts'],
    rules: {
      // The specs reach for `chrome.*` inside `serviceWorker.evaluate`
      // callbacks, which run in the extension's context rather than the spec's.
      'no-restricted-globals': 'off',
      // `async ({}, use)` is how Playwright declares a fixture that depends on
      // no other fixture.
      'no-empty-pattern': 'off',
    },
  },

  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Last, so it wins over the shared configs above that switch these on.
  { files: ['**/*.{ts,tsx}'], rules: DEFERRED },
])
