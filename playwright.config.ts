import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // CI runners launch every worker's persistent context at once, and a browser
  // that is slow to come up would otherwise eat the whole budget during fixture
  // setup. Healthy tests finish in a few seconds either way.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 2 : 0,
  // `fullyParallel` is off, so concurrency is capped by the spec-file count and
  // the run is bounded by the longest file either way. Matching the CI runner's
  // 4 vCPUs therefore costs no wall-clock, and removes the oversubscription that
  // made Chrome side-panel targets flaky to attach to.
  workers: process.env.CI ? 4 : '50%',
  // The `list` reporter owns the log; the custom one adds GitHub annotations for
  // real failures only, so a test that passed on retry leaves the PR diff clean.
  reporter: process.env.CI ? [['list'], ['./tests/e2e/reporters/github-annotations.ts']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
