import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Every worker launches its persistent context at once when the run starts,
  // and a browser that is slow to come up would otherwise eat the whole budget
  // during fixture setup. Healthy tests finish in a few seconds either way.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 2 : 0,
  // A worker's tests share one browser (see tests/e2e/fixtures.ts), so this is
  // now simply how many Chromiums run at once, and matching the CI runner's 4
  // vCPUs is what it is for. Measured on a 4-core sandbox the suite plateaus
  // right there - ~2.8m at 2 workers, ~2.5m at 4, and nothing further at 6 or 8,
  // where the extra browsers only contend for the same cores. Oversubscribing
  // also brings back the contention that made Chrome side-panel targets flaky to
  // attach to.
  //
  // `fullyParallel` stays off deliberately: it does not add concurrency (that is
  // this setting), it only lets one worker take tests from several files. With
  // 13 spec files and 4 workers there is always enough independent work to keep
  // every worker busy, and it measured level with file-serial. Leaving it off
  // also keeps a spec file's tests on one worker, which is where the shared
  // browser's per-test reset is easiest to reason about.
  workers: process.env.CI ? 4 : '50%',
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
})
