#!/usr/bin/env node
/**
 * Guard the *denominator* of the coverage gate.
 *
 * `coverage.thresholds` in `vitest.config.ts` only checks the ratio of covered
 * to measured code. It cannot notice that measured code has quietly shrunk, so
 * a build-chain bug that hides most of `src/**` from instrumentation makes the
 * gate greener, not redder — which is exactly what happened in #268: a
 * line-resolution sourcemap from the auto-import transform collapsed whole
 * modules into a single statement, and coverage reported 100% over a quarter of
 * the codebase.
 *
 * Run by `pnpm test:coverage` after Vitest writes `coverage-summary.json`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

const repoRoot = process.cwd()
const SUMMARY_PATH = path.resolve(repoRoot, 'coverage/coverage-summary.json')

// The probe has to use auto-imported globals or the transform leaves it alone
// and there is no map to inspect. The path need not exist; plugins only match
// it against their include filter.
const PROBE_ID = path.join(repoRoot, 'src/__auto-import-sourcemap-probe__.ts')
const PROBE_CODE = [
  `export const tabId = () => browser.runtime.id`,
  `export const read = async () => await storage.getItem('local:probe')`,
  '',
].join('\n')

/**
 * Segments per mapped line. A line-resolution map (`hires: false`) emits one
 * segment per line, so it sits at 1; a `hires: 'boundary'` map emits one per
 * token boundary and lands far above this. Anything in between is not a shape
 * MagicString produces, so the exact value only has to separate the two.
 */
const MIN_SEGMENTS_PER_MAPPED_LINE = 3

/**
 * Measured statements per non-empty source line, across everything coverage
 * includes. The healthy figure for this repo is ~0.31; the collapsed build in
 * #268 measured 0.08. Type-heavy modules and big object literals legitimately
 * sit near zero on their own, which is why this is checked in aggregate rather
 * than per file.
 */
const MIN_STATEMENTS_PER_SOURCE_LINE = 0.2

const failures = []

const fail = (message) => failures.push(message)

const measureMappings = (mappings) => {
  const mapped = mappings.split(';').filter((line) => line.length > 0)
  const segments = mapped.reduce((sum, line) => sum + line.split(',').length, 0)

  return { lines: mapped.length, segments }
}

/**
 * Probes every plugin rather than `unimport` by name: the last low-resolution
 * map in the chain is the one that decides the final fidelity, so any plugin
 * that rewrites the module can be the one that breaks coverage.
 */
const checkTransformSourcemaps = async () => {
  const plugins = (await WxtVitest()).flat().filter(Boolean)
  const transformed = []

  for (const plugin of plugins) {
    const transform =
      typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
    if (!transform) continue

    let result
    try {
      // These transforms take no Rollup plugin context; one that does will
      // throw, and a plugin we cannot drive is not one we can assert on.
      result = await transform.call({}, PROBE_CODE, PROBE_ID)
    } catch {
      continue
    }
    if (!result || typeof result === 'string' || result.code === PROBE_CODE) continue

    transformed.push(plugin.name)

    if (!result.map) {
      fail(`Plugin \`${plugin.name}\` rewrote the probe module without returning a sourcemap.`)
      continue
    }

    const { lines, segments } = measureMappings(result.map.mappings ?? '')
    const ratio = lines === 0 ? 0 : segments / lines

    if (ratio < MIN_SEGMENTS_PER_MAPPED_LINE) {
      fail(
        `Plugin \`${plugin.name}\` returned a line-resolution sourcemap ` +
          `(${ratio.toFixed(2)} segments per mapped line, expected at least ${MIN_SEGMENTS_PER_MAPPED_LINE}). ` +
          `Coverage will collapse every module it rewrites — see the \`patchedDependencies\` note in \`pnpm-workspace.yaml\`.`,
      )
    }
    if (!result.map.sources?.some((source) => source === PROBE_ID)) {
      fail(
        `Plugin \`${plugin.name}\` returned a sourcemap that does not name the module it transformed ` +
          `(sources: ${JSON.stringify(result.map.sources)}).`,
      )
    }
  }

  if (transformed.length === 0) {
    fail(
      'No Vitest plugin rewrote the auto-import probe. Either the auto-import transform is gone or the probe ' +
        'no longer uses an auto-imported global, and this check is no longer testing anything.',
    )
  }
}

const checkMeasuredVolume = async () => {
  let summary
  try {
    summary = JSON.parse(await readFile(SUMMARY_PATH, 'utf8'))
  } catch {
    fail(
      `No coverage summary at \`${path.relative(repoRoot, SUMMARY_PATH)}\` — run \`pnpm test:coverage\`.`,
    )
    return
  }

  const { total, ...files } = summary
  let sourceLines = 0
  for (const file of Object.keys(files)) {
    const source = await readFile(file, 'utf8')
    sourceLines += source.split('\n').filter((line) => line.trim().length > 0).length
  }

  if (sourceLines === 0) {
    fail('The coverage summary names no files, so there is nothing measured to check.')
    return
  }

  const statements = total.statements.total
  const ratio = statements / sourceLines

  if (ratio < MIN_STATEMENTS_PER_SOURCE_LINE) {
    fail(
      `Coverage measured ${statements} statements across ${sourceLines} lines of source ` +
        `(${ratio.toFixed(3)} per line, expected at least ${MIN_STATEMENTS_PER_SOURCE_LINE}). ` +
        `Most of \`src/**\` is not being instrumented, so the reported percentages mean little.`,
    )
  }
}

await checkTransformSourcemaps()
await checkMeasuredVolume()

if (failures.length > 0) {
  console.error('Coverage fidelity check failed:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '\nSee https://github.com/zizzfizzix/scrape-similar/issues/268 for the failure mode this catches.',
  )
  process.exit(1)
}

console.log(
  'Coverage fidelity check passed: the auto-import transform keeps column-level sourcemaps.',
)
