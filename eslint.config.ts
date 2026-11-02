import js from '@eslint/js'
import vitest from '@vitest/eslint-plugin'
import type { Linter } from 'eslint'
import jestDom from 'eslint-plugin-jest-dom'
import reactHooks from 'eslint-plugin-react-hooks'
import testingLibrary from 'eslint-plugin-testing-library'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import path from 'node:path'
import tseslint from 'typescript-eslint'
import {
  BOOTSTRAP_EXCLUSIONS,
  BOOTSTRAP_LINE_BUDGET,
  COVERAGE_EXCLUSIONS,
} from './coverage-exclusions.ts'
import { noConditionalAwait } from './tools/eslint-rules/no-conditional-await.ts'
import { noContentScriptLock } from './tools/eslint-rules/no-content-script-lock.ts'

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
 * Type-aware linting is switched on (`projectService`). What is on from it is
 * the rules this codebase already passes (ALREADY_CLEAN), the correctness and
 * promise rules (CORRECTNESS_RULES, PROMISE_RULES) and the boolean naming rule; the rest is a backlog tracked in
 * #282, and any rule held off with violations to fix goes in DEFERRED below with
 * the count it has. A rule that is wrong for this codebase rather than merely
 * unfixed goes in OFF_ON_MERITS instead, which is not a worklist.
 */

const TEST_FILES = [
  '**/__tests__/**/*.{ts,tsx}',
  '**/*.test.{ts,tsx}',
  'vitest.setup.ts',
  // The harness modules the tests import, held to the same rules as their
  // callers.
  'tests/support/**/*.{ts,tsx}',
]

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

// `no-floating-promises` only sees a `void` that is a whole statement; in an
// arrow body, a `return` or any other expression position it hides the promise.
const NO_VOID = {
  selector: "UnaryExpression[operator='void']",
  message:
    '`void` hides a promise from `no-floating-promises`. Use `reportRejection(task())` for a promise; otherwise drop the `void`.',
}

// The extension origin differs per browser and per install: `moz-extension://<uuid>`
// on Firefox, a store-assigned id for the Edge Add-ons install. The id in
// package.json only names the Chromium builds that carry the store key.
const OWN_ORIGIN_MESSAGE =
  "Extension origins differ per browser and install. Build or match the extension's own URLs with `browser.runtime.getURL(path)`."
const NO_HARD_CODED_EXTENSION_ORIGIN = [
  ...[
    'Literal[value=/(chrome|moz)-extension\\b/]',
    // The optional `)` also covers the alternation `(chrome|moz)-extension`.
    'Literal[regex.pattern=/(chrome|moz)\\)?-extension\\b/]',
    'TemplateElement[value.raw=/(chrome|moz)-extension\\b/]',
  ].map((selector) => ({ selector, message: OWN_ORIGIN_MESSAGE })),
  // Any position: a named import, a member read, a destructured binding.
  { selector: "Identifier[name='chromeExtensionId']", message: OWN_ORIGIN_MESSAGE },
  ...[
    "MemberExpression[object.property.name='env'][property.name=/^(BROWSER|CHROME|EDGE|FIREFOX)$/]",
    // `const { FIREFOX } = import.meta.env`, which Vite also replaces.
    "VariableDeclarator[init.object.type='MetaProperty'][init.property.name='env'] > ObjectPattern > Property[key.name=/^(BROWSER|CHROME|EDGE|FIREFOX)$/]",
  ].map((selector) => ({
    selector,
    message:
      'Chrome and Edge run the same build, so a build flag cannot tell them apart. Branch on `getBrowserFamily()`.',
  })),
]

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
  '@typescript-eslint/adjacent-overload-signatures': 'error',
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
  '@typescript-eslint/restrict-plus-operands': 'error',
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
 * Typed rules that each had a handful of violations when they came on (#375).
 */
const CORRECTNESS_RULES: Linter.RulesRecord = {
  // Throwing or rejecting with something that is not an `Error` loses the
  // stack trace. A test of the non-`Error` branch disables these on the line.
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/prefer-promise-reject-errors': 'error',
  // Spreading a class instance copies only its own enumerable properties:
  // `{ ...navigator }` copies none, because they are prototype getters.
  '@typescript-eslint/no-misused-spread': 'error',
  '@typescript-eslint/no-unsafe-enum-comparison': 'error',
  '@typescript-eslint/restrict-template-expressions': 'error',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
}

/**
 * None ships in `tseslint.configs.recommended`, so all are enabled here.
 */
const PROMISE_RULES: Linter.RulesRecord = {
  // An `await` on a value that is not a promise is how a caller ends up not
  // waiting for work it means to wait for, e.g. a prop typed `=> void` that the
  // child awaits. `act` with a synchronous callback is typed `void` but returns
  // a thenable that waits a macrotask, so a test that needs that wait says so
  // with `settleEffects`.
  '@typescript-eslint/await-thenable': 'error',
  // `void task` passes this rule; NO_VOID is what rejects it.
  '@typescript-eslint/no-floating-promises': 'error',
  // Every option on, `checksVoidReturn.attributes` included. An async
  // `onClick` looks idiomatic, and would be if the alternative were
  // `onClick={() => void handle()}` — the same dropped rejection, more syntax.
  // The alternative is `reportRejection`, which reports what the handler threw.
  '@typescript-eslint/no-misused-promises': 'error',
}

/**
 * Rules worth having that no longer fit in the diff that turned the linter on.
 * Each is off with the number of violations it reports today, so re-enabling one
 * is a line here plus the fixes it names — and so the count is a claim a reviewer
 * can check rather than an impression. Each names the issue that tracks it.
 */
const DEFERRED: Linter.RulesRecord = {}

/**
 * Rules that are off because they are wrong for this codebase, rather than off
 * until someone gets to them. Nothing here is a worklist: re-reading these
 * needs evidence that the stated reason no longer holds.
 */
const OFF_ON_MERITS = {
  // 268 reports across 19 files, and the suite cannot be query-first. 77 of them
  // select on something Testing Library has no query for by design: the
  // `className` a component computes, asserted directly (15), or a utility class
  // used as the handle (12); the `lucide-*` icon a button is showing (13);
  // `cmdk` / `vaul` / `data-slot` internals of the libraries the UI is built
  // from (27); the component's own root via `:scope > div` (3, plus 4 counted
  // under `className`); the inline `style` positioning the picker menu (4); and
  // `input[type="file"]`, which has no ARIA role (3). The other 191 could move
  // onto `getByRole`, but most of the 19 files would still need a disable.
  'testing-library/no-node-access': 'off',
  // 108 and 21, both off because their fixes do not say the same thing as the
  // assertions they replace. `toHaveTextContent` matches a substring, so it
  // weakens every `expect(el.textContent).toBe(x)` it rewrites; `toHaveStyle`
  // cannot express "this declaration is not set", which 7 of the 21 sites
  // assert. Both fixers also mangle `expect((el as HTMLElement).…)` into
  // unparseable code.
  'jest-dom/prefer-to-have-text-content': 'off',
  'jest-dom/prefer-to-have-style': 'off',
} as const

export default defineConfig([
  globalIgnores([
    '.output/**',
    '.wxt/**',
    'coverage/**',
    'test-results/**',
    // Regenerated by `pnpm update:shadcn`, so a fix here would not survive.
    'src/components/ui/**',
    // Modules the typed rule tests lint against, under a tsconfig of their own.
    'tools/eslint-rules/__tests__/fixtures/**',
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
      ...restrictedSyntax(NO_ENUM, NO_DEFAULT_EXPORT, NO_VOID),
      // `== null` is the deliberate "null or undefined" check; everything else
      // compares by identity.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      ...ALREADY_CLEAN,
      ...CORRECTNESS_RULES,
      ...PROMISE_RULES,
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
    rules: restrictedSyntax(
      NO_ENUM,
      NO_DEFAULT_EXPORT,
      NO_INNER_HTML,
      NO_VOID,
      ...NO_HARD_CODED_EXTENSION_ORIGIN,
    ),
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [...COVERAGE_EXCLUSIONS, ...TEST_FILES],
    plugins: { coverage: { rules: { 'no-conditional-await': noConditionalAwait } } },
    rules: { 'coverage/no-conditional-await': 'error' },
  },

  {
    // A content script gets the page's lock manager, not the extension's, so a
    // storage lock it takes serialises nothing (#345). Its writes go through
    // the background instead.
    // Every layout WXT reads a content script from.
    files: [
      'src/entrypoints/content/**/*.{ts,tsx}',
      'src/entrypoints/*.content.{ts,tsx}',
      'src/entrypoints/*.content/**/*.{ts,tsx}',
    ],
    ignores: TEST_FILES,
    plugins: { 'content-script': { rules: { 'no-lock': noContentScriptLock } } },
    rules: {
      // `.wxt/types/imports-module.d.ts` re-exports with relative paths inside
      // an ambient module, which TS cannot resolve, so what `#imports` names
      // has no declaration for `content-script/no-lock` to walk.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '#imports',
              message:
                'Import from the module itself or use the auto-import, so the lock check can follow it.',
            },
          ],
        },
      ],
      'content-script/no-lock': [
        'error',
        {
          boundaries: [
            {
              module: path.join(import.meta.dirname, 'src/utils/analytics.ts'),
              name: 'captureEvent',
              reason:
                'In a content script it sends TRACK_EVENT to the background, which queues the event.',
            },
          ],
        },
      ],
    },
  },

  {
    // Everything a side panel TabPanel renders. Every tab shares the shell's
    // one <Toaster>, so a toast raised by a hidden tab's panel lands over the
    // tab on screen; useShownToast holds it until its panel is shown.
    // Hooks and utils too, since a panel can reach a toast through either.
    files: [
      'src/components/**/*.tsx',
      'src/hooks/**/*.ts',
      'src/utils/**/*.{ts,tsx}',
      'src/entrypoints/sidepanel/TabPanel.tsx',
    ],
    // The settings drawer belongs to the shell, not to a tab, and the hook is
    // the one place the toast is called from.
    ignores: ['src/components/Settings.tsx', 'src/hooks/use-shown-toast.ts', ...TEST_FILES],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'sonner',
              importNames: ['toast'],
              message: 'Use useShownToast so a hidden side panel tab cannot toast over another.',
            },
          ],
        },
      ],
    },
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
    rules: restrictedSyntax(NO_ENUM, NO_INNER_HTML, NO_VOID, ...NO_HARD_CODED_EXTENSION_ORIGIN),
  },

  {
    files: ['*.config.{ts,js}', 'eslint.config.ts'],
    rules: restrictedSyntax(NO_ENUM, NO_VOID),
  },

  {
    files: TEST_FILES,
    extends: [
      vitest.configs.recommended,
      testingLibrary.configs['flat/react'],
      jestDom.configs['flat/recommended'],
    ],
    settings: {
      // Turns off the plugin's aggressive module reporting, so only utils
      // imported from an official `@testing-library/*` package count. Otherwise
      // any `render` is taken for Testing Library's, and `no-unnecessary-act` and
      // `render-result-naming-convention` report 28 sites that are not:
      // `scrape-guess.test.ts`'s own `render(html, selector)` helper, and the
      // `root.render(…)` that `use-media-query` and `distinct_id` drive a React
      // root with by hand.
      'testing-library/utils-module': 'off',
    },
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
      // Without NO_VOID: callbacks passed to `evaluate` run in the browser and
      // cannot import `reportRejection`.
      ...restrictedSyntax(NO_ENUM, NO_DEFAULT_EXPORT),
    },
  },

  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Last, so it wins over the shared configs above that switch these on.
  { files: ['**/*.{ts,tsx}'], rules: { ...DEFERRED, ...OFF_ON_MERITS } },
])
