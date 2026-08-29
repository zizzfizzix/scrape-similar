#!/usr/bin/env node
/**
 * Render the v8 coverage summary as Markdown.
 *
 * The gate itself is the `coverage.thresholds` block in `vitest.config.ts`:
 * `pnpm test:coverage` exits non-zero when coverage drops below it, and
 * `scripts/check-coverage-fidelity.mjs` catches the case that block cannot see —
 * the measured code itself shrinking. This script only makes the numbers
 * readable, so a failing run says which files regressed without anyone opening
 * the raw log.
 *
 * Writes to stdout; the CI job appends it to `$GITHUB_STEP_SUMMARY`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SUMMARY_PATH = path.resolve(process.cwd(), 'coverage/coverage-summary.json')
const METRICS = ['statements', 'branches', 'functions', 'lines']

const readSummary = async () => {
  try {
    return JSON.parse(await readFile(SUMMARY_PATH, 'utf8'))
  } catch {
    return null
  }
}

const formatPct = (pct) => `${pct.toFixed(2)}%`

const summary = await readSummary()

if (!summary) {
  console.log('## Unit test coverage\n')
  console.log('No coverage report was produced — the test run failed before coverage was written.')
  process.exit(0)
}

const { total, ...files } = summary

console.log('## Unit test coverage\n')
console.log('| Metric | Covered | Total | Coverage |')
console.log('| --- | ---: | ---: | ---: |')
for (const metric of METRICS) {
  const { covered, total: count, pct } = total[metric]
  const label = metric[0].toUpperCase() + metric.slice(1)
  console.log(`| ${label} | ${covered} | ${count} | ${formatPct(pct)} |`)
}

// The thresholds are a floor, not the target, so this lists every file short of
// full coverage rather than only the ones dragging the total under the gate.
const incomplete = Object.entries(files)
  .map(([file, metrics]) => ({
    file: path.relative(process.cwd(), file),
    misses: METRICS.filter((metric) => metrics[metric].pct < 100),
    uncoveredLines: metrics.lines.total - metrics.lines.covered,
    metrics,
  }))
  .filter(({ misses }) => misses.length > 0)
  .sort((a, b) => b.uncoveredLines - a.uncoveredLines || a.file.localeCompare(b.file))

if (incomplete.length === 0) {
  console.log('\nEvery included file is fully covered.')
  process.exit(0)
}

// A wholesale regression can list every file; the step summary has a size
// limit, and the first rows are enough to start from.
const MAX_ROWS = 40
console.log(`\n### Files below 100% (${incomplete.length})\n`)
console.log('| File | Uncovered lines | Statements | Branches | Functions | Lines |')
console.log('| --- | ---: | ---: | ---: | ---: | ---: |')
for (const { file, uncoveredLines, metrics } of incomplete.slice(0, MAX_ROWS)) {
  const cells = METRICS.map((metric) => formatPct(metrics[metric].pct))
  console.log(`| \`${file}\` | ${uncoveredLines} | ${cells.join(' | ')} |`)
}
if (incomplete.length > MAX_ROWS) {
  console.log(`\n…and ${incomplete.length - MAX_ROWS} more. See the \`coverage-report\` artifact.`)
}
