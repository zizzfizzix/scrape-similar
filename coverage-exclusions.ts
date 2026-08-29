/**
 * Files left out of unit-test coverage measurement.
 *
 * Everything here shrinks the denominator the `coverage.thresholds` block in
 * `vitest.config.ts` is measured against, so an entry added quietly makes the
 * gate easier instead of failing a check. Each group below therefore carries
 * the reason it is exempt, and `src/__tests__/coverage-exclusions.test.ts`
 * asserts the list is exactly what gets applied — widening it means editing
 * that test too, in the same diff.
 *
 * This list is not the only way the denominator can shrink: a build-chain bug
 * can hide code from instrumentation with no entry to review at all (#268).
 * `scripts/check-coverage-fidelity.mjs` covers that side.
 *
 * Now that the measured set is at 100% (#266), this list is the only runtime
 * code left outside the gate, so each group was re-argued rather than
 * inherited. All three still stand, on the grounds recorded below.
 */

/**
 * Generated shadcn-ui primitives, refreshed by `pnpm update:shadcn`.
 *
 * Tests written against them would be overwritten by the next refresh; bespoke
 * logic belongs in `src/components/custom/` or the parent component instead.
 *
 * Re-argued at 100%: still the whole story. `scripts/update-shadcn.sh` moves
 * anything the registry does not know about into `src/components/custom/`,
 * which is measured — and that directory is empty today, so nothing bespoke has
 * accumulated behind this glob. The primitives themselves are exercised through
 * the components that render them, which are measured.
 */
export const GENERATED_EXCLUSIONS = ['src/components/ui/**']

/**
 * Type-only modules: these compile to nothing, so there is no statement to run.
 *
 * The gate test enforces that by importing each one and asserting it exports no
 * runtime value — a module that grows a `const` stops qualifying and has to
 * come off this list.
 *
 * Re-argued at 100%: this one needs no judgement, because the gate test decides
 * it mechanically on every run. An entry that stops compiling to nothing fails
 * the suite rather than quietly shrinking the denominator.
 */
export const TYPE_ONLY_EXCLUSIONS = ['src/entrypoints/background/types.ts']

/**
 * Entrypoint bootstrap: `createRoot().render()` and WXT `define*` wiring, which
 * needs a real extension context rather than jsdom. The E2E suite covers it.
 *
 * The logic these files used to hold now lives in modules beside them
 * (`content/bootstrap.ts`, `sidepanel/SidePanelRoot.tsx`), and the gate test
 * holds them to a line budget so it cannot drift back in unmeasured.
 *
 * Re-argued at 100%: this is the only group left resting on judgement, so the
 * claim was checked rather than repeated — and where it did not hold, the code
 * moved instead of the argument. What the background worker starts now lives in
 * `background/bootstrap.ts`, and finding a page's root element and wrapping it
 * in the shared providers now lives in `components/extension-page.tsx`; both are
 * measured. What is left is 10-19 lines per file of `define*` wrapper, log
 * level and provider nesting, with no branch in any of them.
 *
 * And "the E2E suite covers it" is specific: each page is loaded by a spec
 * named after it (`tests/e2e/full-data-view.spec.ts`, `onboarding.spec.ts`,
 * `options.spec.ts`, `sidepanel.spec.ts`), and the background worker and
 * content script run for every spec in the suite.
 */
export const BOOTSTRAP_EXCLUSIONS = [
  'src/entrypoints/full-data-view/main.tsx',
  'src/entrypoints/onboarding/main.tsx',
  'src/entrypoints/options/main.tsx',
  'src/entrypoints/sidepanel/main.tsx',
  'src/entrypoints/background/index.ts',
  'src/entrypoints/content/index.ts',
]

/**
 * A bootstrap file this long is still plausibly just wiring. Past it, assume
 * logic has accumulated and move it to a module that coverage measures.
 *
 * Ratcheted from 60 down to 25 once the orchestration these files used to hold
 * moved into `background/bootstrap.ts` and `components/extension-page.tsx`: the
 * longest of them is now 19 lines, so 25 leaves room for a provider or an
 * import without leaving room for logic.
 */
export const BOOTSTRAP_LINE_BUDGET = 25

export const COVERAGE_EXCLUSIONS = [
  ...GENERATED_EXCLUSIONS,
  ...TYPE_ONLY_EXCLUSIONS,
  ...BOOTSTRAP_EXCLUSIONS,
]
