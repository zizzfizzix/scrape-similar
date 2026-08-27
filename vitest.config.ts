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
      exclude: [
        // Generated shadcn-ui primitives: refreshed by `pnpm update:shadcn`.
        'src/components/ui/**',
        // Type-only modules have no runtime behaviour to exercise.
        'src/**/*.d.ts',
        'src/utils/types.ts',
        'src/entrypoints/background/types.ts',
        // Entrypoint bootstrap: `createRoot().render()` / WXT `define*` wiring
        // with no branching — the logic each one used to hold now lives in a
        // module of its own. Exercised end-to-end by the Playwright suite.
        'src/entrypoints/*/main.tsx',
        'src/entrypoints/background/index.ts',
        'src/entrypoints/content/index.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
