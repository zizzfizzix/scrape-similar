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
  // Every test launches its own browser, so wall-clock stops improving long
  // before this number does: measured on a 4-core box the suite sat in the same
  // ~3min band at 2, 4, 8 and 20 workers, because per-test latency grows with
  // concurrency as fast as the scheduling gains. Matching the CI runner's 4
  // vCPUs therefore costs no wall-clock, and removes the oversubscription that
  // made Chrome side-panel targets flaky to attach to.
  //
  // `fullyParallel` stays off deliberately: it does not add concurrency (that is
  // this setting), it only lets one worker take tests from several files. With
  // 13 spec files and 4 workers there is always enough independent work to keep
  // every worker busy, and turning it on measured slightly slower. It would only
  // matter if workers ever exceeded the spec-file count - which is what the old
  // `workers: 20` did, capping itself at 13.
  workers: process.env.CI ? 4 : '50%',
  // The `list` reporter owns the log; the custom one adds GitHub annotations for
  // real failures only, so a test that passed on retry leaves the PR diff clean.
  reporter: process.env.CI ? [['list'], ['./tests/e2e/reporters/github-annotations.ts']] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
