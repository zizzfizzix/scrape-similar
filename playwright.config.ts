import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  // Run tests sequentially because all of them share the same persistent context
  workers: 1,
  use: {
    trace: 'on-first-retry',
  },
})
