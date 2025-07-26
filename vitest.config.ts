import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    setupFiles: './vitest.setup.ts',
    env: loadEnv('test', process.cwd(), ''),
  },
})
