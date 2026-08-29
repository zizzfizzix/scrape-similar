import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { COVERAGE_EXCLUSIONS } from '@@/coverage-exclusions'
import { findConditionalAwaits } from '@@/coverage-hazards'
import { describe, expect, it } from 'vitest'

/**
 * `coverage-hazards.ts` explains what an `await` on one side of a branch does to
 * the counts for the rest of its function, and why #272 read as a lost branch
 * rather than as the arithmetic it is. This is the gate: the shape is banned
 * from every file the coverage gate measures, so a reintroduction fails here
 * with the fix in the message instead of surfacing later as a branch nobody can
 * cover.
 */

const repoRoot = path.resolve(import.meta.dirname, '../..')

const isTestFile = (relativePath: string) =>
  relativePath.includes('__tests__/') || /\.test\.tsx?$/.test(relativePath)

/**
 * The exclusion globs are simple enough to match without a glob library: a
 * trailing `/**` directory prefix, or an exact path.
 */
const isExcluded = (relativePath: string) =>
  COVERAGE_EXCLUSIONS.some((pattern) =>
    pattern.endsWith('/**')
      ? relativePath.startsWith(pattern.slice(0, -2))
      : relativePath === pattern,
  )

/** Exactly the files `coverage.include` measures: `src/**` minus the exclusions and the tests. */
const measuredSources = async () => {
  const entries = await readdir(path.join(repoRoot, 'src'), {
    recursive: true,
    withFileTypes: true,
  })

  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)))
    .filter((relativePath) => !isTestFile(relativePath) && !isExcluded(relativePath))
    .sort()
}

describe('conditionally-evaluated `await`', () => {
  it('does not appear in any file the coverage gate measures', async () => {
    const offenders: string[] = []

    for (const relativePath of await measuredSources()) {
      const code = await readFile(path.join(repoRoot, relativePath), 'utf8')
      for (const { line, column, branch } of findConditionalAwaits(code, relativePath)) {
        offenders.push(`${relativePath}:${line}:${column} — \`await\` on ${branch}`)
      }
    }

    expect(
      offenders,
      'V8 counts the rest of the function as if it only ran on the branch that reached the ' +
        '`await`. Await on its own line and use the result in the expression — see ' +
        '`coverage-hazards.ts` (#272).',
    ).toEqual([])
  })

  // Without this the scan silently passes on an empty file list — the same way
  // an empty denominator makes a percentage gate pass in #268.
  it('scans the files it is meant to scan', async () => {
    const scanned = await measuredSources()

    expect(scanned).toContain('src/utils/posthog-background.ts')
    expect(scanned).toContain('src/components/posthog-provider.tsx')
    expect(scanned).not.toContain('src/components/ui/button.tsx')
    expect(scanned).not.toContain('src/entrypoints/background/index.ts')
    expect(scanned.some(isTestFile)).toBe(false)
    expect(scanned.length).toBeGreaterThan(50)
  })
})

describe('findConditionalAwaits', () => {
  const find = (code: string, file = 'probe.ts') => findConditionalAwaits(code, file)

  it('flags each short-circuit that can skip the `await`', () => {
    expect(find('const a = async () => x || (await y())')[0]?.branch).toBe(
      'the right-hand side of `||`',
    )
    expect(find('const a = async () => x && (await y())')[0]?.branch).toBe(
      'the right-hand side of `&&`',
    )
    expect(find('const a = async () => x ?? (await y())')[0]?.branch).toBe(
      'the right-hand side of `??`',
    )
    expect(find('const a = async () => (x ? await y() : await z())').map((f) => f.branch)).toEqual([
      'an arm of `?:`',
      'an arm of `?:`',
    ])
  })

  it('reports the position an editor would show', () => {
    expect(find('const a = async () => {\n  return x || (await y())\n}')).toEqual([
      { line: 2, column: 16, branch: 'the right-hand side of `||`' },
    ])
  })

  it('leaves unconditional awaits alone', () => {
    expect(find('const a = async () => {\n  const y = await z()\n  return x || y\n}')).toEqual([])
    // The left of a short-circuit and the test of a ternary always run.
    expect(find('const a = async () => (await y()) || x')).toEqual([])
    expect(find('const a = async () => ((await y()) ? 1 : 2)')).toEqual([])
    // A statement-level branch gives V8 a block of its own, so the code after it
    // keeps the function's count. Measured, not assumed.
    expect(find('const a = async () => {\n  if (x) {\n    await y()\n  }\n}')).toEqual([])
  })

  it('starts fresh inside a nested function, which runs when it is called', () => {
    expect(find('const a = () => x || (async () => await y())')).toEqual([])
    expect(find('const a = () => x || { async m() {\n  await y()\n} }')).toEqual([])
  })

  it('parses the syntax the measured files are written in', () => {
    expect(find('const a = <T,>(v: T): T => v')).toEqual([])
    expect(find('const a = () => <div className="x">{y}</div>', 'probe.tsx')).toEqual([])
  })
})
