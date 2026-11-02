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
 * the rules this codebase already passes (ALREADY_CLEAN), the correctness,
 * stylistic, assertion, unsafe-`any`, promise, unbound-method,
 * nullish-coalescing, unnecessary-condition, confusing-void and inert-function
 * rules (CORRECTNESS_RULES, TIDY_RULES, ASSERTION_RULES, UNSAFE_ANY_RULES,
 * PROMISE_RULES, UNBOUND_METHOD, NULLISH_COALESCING, UNNECESSARY_CONDITION,
 * CONFUSING_VOID, INERT_FUNCTION_RULES) and the boolean naming rule; the
 * rest is a backlog tracked in #282, and any rule held off with violations to
 * fix goes in DEFERRED below with the count it has. A rule that is wrong for
 * this codebase rather than merely unfixed goes in OFF_ON_MERITS instead, which
 * is not a worklist, or in OFF_ON_MERITS_IN_TESTS when it is wrong only there.
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
  '@typescript-eslint/restrict-plus-operands': 'error',
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
 * Typed rules that catch a value of the wrong kind reaching a throw, a
 * rejection, a spread, a comparison or a template string (#375).
 */
const CORRECTNESS_RULES: Linter.RulesRecord = {
  // Throwing or rejecting with something that is not an `Error` loses the
  // stack trace. Code that has to pass a non-`Error` on (a test of that branch,
  // a stand-in for an API that does) disables these on the line with the reason.
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
 * Typed stylistic and redundancy rules (#376): one spelling for each construct,
 * and no conversion, annotation, default, type parameter, constructor, class,
 * template or boolean comparison that has no effect.
 */
const TIDY_RULES: Linter.RulesRecord = {
  // `T[]` is what the codebase already writes; `Array<T>` was the exception.
  '@typescript-eslint/array-type': ['error', { default: 'array' }],
  // An index signature becomes a `Record` alias rather than an interface; a
  // map type has no members to extend or merge.
  '@typescript-eslint/consistent-indexed-object-style': 'error',
  '@typescript-eslint/no-extraneous-class': 'error',
  '@typescript-eslint/no-inferrable-types': 'error',
  '@typescript-eslint/no-invalid-void-type': 'error',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
  '@typescript-eslint/no-unnecessary-template-expression': 'error',
  '@typescript-eslint/no-unnecessary-type-conversion': 'error',
  '@typescript-eslint/no-unnecessary-type-parameters': 'error',
  '@typescript-eslint/no-useless-constructor': 'error',
  '@typescript-eslint/no-useless-default-assignment': 'error',
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/prefer-regexp-exec': 'error',
}

/**
 * Type assertions that say nothing the checker does not already know (#377).
 *
 * Their fixers write code that does not compile in four places, each of which
 * states its type another way. `no-unnecessary-type-assertion` misreads a `let`
 * initialised to `null` with no annotation (it sees the narrowed type, not the
 * evolving one: annotate it), a cast from `unknown` wrapped in `?? undefined`
 * (cast the value itself), and a cast in a mock that widens a property later
 * writes rely on (`vi.hoisted<T>`). `non-nullable-type-assertion-style` turns
 * `querySelector(s) as HTMLElement` into `!`, which drops the type the call
 * inferred from the cast (`querySelector<HTMLElement>(s)!`).
 */
const ASSERTION_RULES: Linter.RulesRecord = {
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/non-nullable-type-assertion-style': 'error',
}

/**
 * An `any` reaching a typed position (#378). Explicit `any` is banned, so what
 * these catch comes from untyped sources: `JSON.parse`, a `vi.fn()` with no
 * signature, a `sendMessage` reply with no annotation on the receiver, and
 * Vitest's asymmetric matchers when one is an object-literal property.
 */
const UNSAFE_ANY_RULES: Linter.RulesRecord = {
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
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
 * A method passed by reference loses `this` (#379). WXT's storage items are
 * built from closures and would survive it, but their type declares methods,
 * so callers wrap them in arrows rather than lean on how they are built. Test
 * files take `vitest/unbound-method` instead, which reads `expect(obj.method)`
 * and `vi.mocked(obj.method)` as the assertions they are.
 */
const UNBOUND_METHOD: Linter.RulesRecord = {
  '@typescript-eslint/unbound-method': 'error',
}

/**
 * `a || b` falls back on `''`, `0` and `false` as well as on null and
 * undefined (#380). Strings are exempt: an empty error message, URL, title,
 * column key or attribute value means "none" everywhere in this codebase, so
 * `||` is the intended fallback for every one of them. Other types use `??`,
 * or keep `||` with a disable that says why the falsy value falls back. Setting
 * any `ignorePrimitives` flag also exempts a union with a string member and an
 * operand typed `any` or `unknown` (a message payload), so an `||` on those
 * passes unread.
 */
const NULLISH_COALESCING: Linter.RulesRecord = {
  '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
}

/**
 * A condition the types say cannot go the other way (#381). Where the runtime
 * value can be wider than its type — a message payload, a callback argument
 * left unset alongside `lastError`, a DOM property read before the page has
 * built it — widen the type at the cast or annotation so the guard has
 * something to check, rather than disabling the rule. Where it cannot, the
 * branch is dead: delete it along with any test that faked its input.
 */
const UNNECESSARY_CONDITION: Linter.RulesRecord = {
  '@typescript-eslint/no-unnecessary-condition': 'error',
}

/**
 * A void call used as a value (#382). Arrow shorthands are exempt: without
 * the exemption the rule reports 318 sites, nearly all
 * `onClick={() => doThing()}`, where the arrow's return value is never read,
 * and rewriting each into a block body buys no safety. A test that a void function returns nothing at run time
 * calls it through a type returning `unknown`: a function returning a promise
 * is assignable to a void-returning type, so its signature does not rule out
 * the promise.
 */
const CONFUSING_VOID: Linter.RulesRecord = {
  '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
}

/**
 * An `async` function that never awaits, and a function with an empty body
 * (#383). Everything but tests, which are exempt in OFF_ON_MERITS_IN_TESTS.
 * An empty function that is a deliberate no-op says why in a comment inside
 * its body, which the rule accepts.
 */
const INERT_FUNCTION_RULES: Linter.RulesRecord = {
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/no-empty-function': 'error',
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
  // 380 reports across 58 files, 342 of them in tests. Outside tests, a `!` with
  // a comment saying why the value is present is how this codebase states a
  // guarantee the types cannot (a capture group a successful match always
  // fills, an index whose bounds were just checked, a tab id the router already
  // required), in place of a defensive branch no test can reach. The rule would
  // turn each one back into that branch or into a disable carrying the same
  // comment. In tests, a `!` reads back what the test just rendered or set up,
  // and a missing value fails the test on that line, as an
  // `expect(x).not.toBeNull()` before it would. Only the `strict`,
  // `strictTypeChecked` and `all` presets ship the rule; it is listed so the
  // decision survives a move to one of them.
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
      ...TIDY_RULES,
      ...ASSERTION_RULES,
      ...UNSAFE_ANY_RULES,
      ...PROMISE_RULES,
      ...UNBOUND_METHOD,
      ...NULLISH_COALESCING,
      ...UNNECESSARY_CONDITION,
      ...CONFUSING_VOID,
      ...INERT_FUNCTION_RULES,
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
  { files: ['**/*.{ts,tsx}'], rules: { ...DEFERRED, ...OFF_ON_MERITS } },
  { files: [...TEST_FILES, 'tests/e2e/**/*.ts'], rules: OFF_ON_MERITS_IN_TESTS },
])
