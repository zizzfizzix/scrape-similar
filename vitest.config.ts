import { loadEnv, type PluginOption } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing'

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
  },
})
