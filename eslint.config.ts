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
 * TypeScript files get typescript-eslint's `strictTypeChecked` and
 * `stylisticTypeChecked` (#282). What departs from them is listed here:
 * PRESET_OPTIONS where a preset rule takes other options, BEYOND_PRESETS and
 * BOOLEAN_PREFIX for rules neither preset ships, and OFF_ON_MERITS /
 * OFF_ON_MERITS_IN_TESTS for rules that are wrong for this codebase.
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

const PRESET_OPTIONS: Linter.RulesRecord = {
  // `a || b` also falls back on `0` and `false`. An empty string means "none"
  // wherever this codebase falls back from one, so strings keep `||`. Setting
  // any `ignorePrimitives` flag also exempts unions with a string member and
  // `any` / `unknown` operands, so an `||` on those passes unread.
  '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
  // A number prints as itself. Options merge with the rule's own defaults,
  // which allow most types, not with the preset's, so the rest are restated.
  // The default `allow` list (`Error`, `URL`, `URLSearchParams`) stays.
  '@typescript-eslint/restrict-template-expressions': [
    'error',
    {
      allowNumber: true,
      allowAny: false,
      allowBoolean: false,
      allowNever: false,
      allowNullish: false,
      allowRegExp: false,
    },
  ],
  // Without the exemption the rule reports 312 sites, nearly all
  // `onClick={() => doThing()}`, whose return value nothing reads.
  '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
}

const BEYOND_PRESETS: Linter.RulesRecord = {
  // A `switch` over an `as const` union (the enum replacement) names every
  // member, so adding one fails here rather than falling into a `default`.
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  // Property signatures get parameter types checked contravariantly; method
  // signatures are bivariant.
  '@typescript-eslint/method-signature-style': 'error',
  // `[10, 9, 1].sort()` sorts as strings: `[1, 10, 9]`.
  '@typescript-eslint/require-array-sort-compare': 'error',
  // `consistent-type-imports` and `consistent-type-exports` are left out:
  // `verbatimModuleSyntax` already makes `tsc` require `import type` and
  // `export type`, and the only other thing the import rule reports is
  // `importOriginal<typeof import('…')>()`, Vitest's documented mock idiom.
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
 * Rules that are off because they are wrong for this codebase, rather than off
 * until someone gets to them. Nothing here is a worklist: re-reading these
 * needs evidence that the stated reason no longer holds.
 */
const OFF_ON_MERITS = {
  // 274 reports across 20 files, and the suite cannot be query-first. Of the
  // 268 sorted in #280, 77 select on something Testing Library has no query for
  // by design: the `className` a component computes, asserted directly (15), or
  // a utility class used as the handle (12); the `lucide-*` icon a button is
  // showing (13); `cmdk` / `vaul` / `data-slot` internals of the libraries the
  // UI is built from (27); the component's own root via `:scope > div` (3, plus
  // 4 counted under `className`); the inline `style` positioning the picker
  // menu (4); and `input[type="file"]`, which has no ARIA role (3). The other
  // 191 could move onto `getByRole`, but most of the files would still need a
  // disable.
  'testing-library/no-node-access': 'off',
  // 128 and 24, both off because their fixes do not say the same thing as the
  // assertions they replace. `toHaveTextContent` matches a substring, so it
  // weakens every `expect(el.textContent).toBe(x)` it rewrites; `toHaveStyle`
  // cannot express "this declaration is not set", which 7 of the 21 sites
  // measured in #288 assert. Both fixers also mangle
  // `expect((el as HTMLElement).…)` into unparseable code.
  'jest-dom/prefer-to-have-text-content': 'off',
  'jest-dom/prefer-to-have-style': 'off',
  // 385 reports across 58 files, 344 of them in tests. Outside tests, a `!` with
  // a comment saying why the value is present is how this codebase states a
  // guarantee the types cannot (a capture group a successful match always
  // fills, an index whose bounds were just checked, a tab id the router already
  // required), in place of a defensive branch no test can reach. The rule would
  // turn each one back into that branch or into a disable carrying the same
  // comment. In tests, a `!` reads back what the test just rendered or set up.
  // `expect(x).not.toBeNull()` does not narrow the type; `assert.exists(x)` from
  // vitest does, and fails with a clearer message, at the assertion rather than
  // at a later use of the value, but the rule would demand that extra line
  // at 344 sites only to improve the message of a test that is already failing.
  '@typescript-eslint/no-non-null-assertion': 'off',
} as const

/**
 * OFF_ON_MERITS for test files only, where the idioms these rules report are
 * the point of the code.
 */
const OFF_ON_MERITS_IN_TESTS = {
  // 136 reports, all in tests. 86 are `it` / hook callbacks, where dropping the
  // `async` changes nothing but means putting it back with the first `await`.
  // The other 50 are why the rule stays off: `act(async () => …)`, which waits
  // for microtasks that a synchronous `act` does not (and awaiting a
  // synchronous `act` fails `await-thenable`), and stand-ins for a callback
  // typed to return a promise (`withStorageLock`, `collectTabsWithData`,
  // `mockImplementation`), where `async` is the plainest way to return one.
  '@typescript-eslint/require-await': 'off',
  // 244 reports, all in tests: `onChange: () => {}` props,
  // `mockImplementation(() => {})` silencing a spy, `new Promise(() => {})`
  // holding a read pending, the jsdom shims in `vitest.setup.ts`, placeholder
  // resolvers (`let release = () => {}`), and the E2E specs' best-effort
  // `.catch(() => {})`. A comment in each body would say "no-op" 244 times.
  '@typescript-eslint/no-empty-function': 'off',
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
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
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
      ...PRESET_OPTIONS,
      ...BEYOND_PRESETS,
      ...BOOLEAN_PREFIX,
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
      // Reads `expect(obj.method)` and `vi.mocked(obj.method)` as the
      // assertions they are.
      '@typescript-eslint/unbound-method': 'off',
      'vitest/unbound-method': 'error',
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

  // These two last, so they win over any shared config above that switches
  // one of these rules on.
  { files: ['**/*.{ts,tsx}'], rules: OFF_ON_MERITS },
  { files: [...TEST_FILES, 'tests/e2e/**/*.ts'], rules: OFF_ON_MERITS_IN_TESTS },
])
