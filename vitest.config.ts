import { COVERAGE_EXCLUSIONS } from './coverage-exclusions.ts'
import { loadEnv, type PluginOption } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  // FIXME: Workaround for vite 6 vs 7 plugin type mismatch
  // https://github.com/wxt-dev/wxt/issues/1702
  plugins: [WxtVitest() as PluginOption],
  test: {
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    setupFiles: './vitest.setup.ts',
    env: loadEnv('test', process.cwd(), ''),
    exclude: [...configDefaults.exclude, './tests/e2e/**'],
    coverage: {
      provider: 'v8',
      // `json-summary` feeds `scripts/coverage-summary.mjs`, which renders the
      // numbers onto the PR check page.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: COVERAGE_EXCLUSIONS,
      // Baselined to what the suite actually covers, to ratchet upward as gaps
      // close — never down to accommodate a regression. These read low against
      // the 100% this project used to claim only because that number was
      // measured over a quarter of the codebase; see #268.
      thresholds: {
        statements: 90,
        branches: 86,
        functions: 89,
        lines: 90,
      },
    },
  },
})
