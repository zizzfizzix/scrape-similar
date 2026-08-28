/**
 * Files left out of unit-test coverage measurement.
 *
 * `src/**` is otherwise gated at 100% (see `coverage.thresholds` in
 * `vitest.config.ts`), which makes this list the only place uncovered code can
 * hide: adding an entry silently shrinks the denominator instead of failing a
 * check. So each group below carries the reason it is exempt, and
 * `src/__tests__/coverage-exclusions.test.ts` asserts the list is exactly what
 * gets applied — widening it means editing that test too, in the same diff.
 */

/**
 * Generated shadcn-ui primitives, refreshed by `pnpm update:shadcn`.
 *
 * Tests written against them would be overwritten by the next refresh; bespoke
 * logic belongs in `src/components/custom/` or the parent component instead.
 */
export const GENERATED_EXCLUSIONS = ['src/components/ui/**']

/**
 * Type-only modules: these compile to nothing, so there is no statement to run.
 *
 * The gate test enforces that by importing each one and asserting it exports no
 * runtime value — a module that grows a `const` stops qualifying and has to
 * come off this list.
 */
export const TYPE_ONLY_EXCLUSIONS = ['src/entrypoints/background/types.ts']

/**
 * Entrypoint bootstrap: `createRoot().render()` and WXT `define*` wiring, which
 * needs a real extension context rather than jsdom. The E2E suite covers it.
 *
 * The logic these files used to hold now lives in modules beside them
 * (`content/bootstrap.ts`, `sidepanel/SidePanelRoot.tsx`), and the gate test
 * holds them to a line budget so it cannot drift back in unmeasured.
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
 */
export const BOOTSTRAP_LINE_BUDGET = 60

export const COVERAGE_EXCLUSIONS = [
  ...GENERATED_EXCLUSIONS,
  ...TYPE_ONLY_EXCLUSIONS,
  ...BOOTSTRAP_EXCLUSIONS,
]
