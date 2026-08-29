import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_EXCLUSIONS,
  BOOTSTRAP_LINE_BUDGET,
  COVERAGE_EXCLUSIONS,
  GENERATED_EXCLUSIONS,
  TYPE_ONLY_EXCLUSIONS,
} from '@@/coverage-exclusions'

/**
 * Every entry on the coverage exclusion list drops code out of the measured
 * total, so the list is a way to make the gate easier without lowering it.
 * These tests make widening it deliberate and keep each exemption's stated
 * reason true. (The other way the measured total can shrink — instrumentation
 * silently losing whole modules — is guarded by
 * `scripts/check-coverage-fidelity.mjs`.)
 */

const repoRoot = path.resolve(import.meta.dirname, '../..')

const readSource = (relativePath: string) => readFile(path.join(repoRoot, relativePath), 'utf8')

describe('the coverage exclusion list', () => {
  // Kept as a literal on purpose: an entry added to `coverage-exclusions.ts`
  // fails here until it is added below too, so it cannot slip through review as
  // a one-line config change.
  it('excludes exactly the files we have agreed to leave unmeasured', () => {
    expect(COVERAGE_EXCLUSIONS).toEqual([
      'src/components/ui/**',
      'src/entrypoints/background/types.ts',
      'src/entrypoints/full-data-view/main.tsx',
      'src/entrypoints/onboarding/main.tsx',
      'src/entrypoints/options/main.tsx',
      'src/entrypoints/sidepanel/main.tsx',
      'src/entrypoints/background/index.ts',
      'src/entrypoints/content/index.ts',
    ])
  })

  it('names no file that has since been moved or deleted', async () => {
    const concretePaths = COVERAGE_EXCLUSIONS.filter((entry) => !entry.includes('*'))

    for (const relativePath of concretePaths) {
      await expect(
        readSource(relativePath),
        `${relativePath} is excluded from coverage but no longer exists`,
      ).resolves.toBeTypeOf('string')
    }
  })
})

describe('the type-only exemption', () => {
  it('covers only modules that compile to nothing', async () => {
    for (const relativePath of TYPE_ONLY_EXCLUSIONS) {
      const module = await import(/* @vite-ignore */ `@@/${relativePath}`)

      expect(
        Object.keys(module),
        `${relativePath} is excluded as type-only but exports a runtime value, so it needs covering`,
      ).toEqual([])
    }
  })
})

describe('the bootstrap exemption', () => {
  it('covers only files small enough to still be wiring', async () => {
    for (const relativePath of BOOTSTRAP_EXCLUSIONS) {
      const lineCount = (await readSource(relativePath)).trimEnd().split('\n').length

      expect(
        lineCount,
        `${relativePath} has grown past ${BOOTSTRAP_LINE_BUDGET} lines — move its logic to a module beside it and cover it there`,
      ).toBeLessThanOrEqual(BOOTSTRAP_LINE_BUDGET)
    }
  })

  it('covers only entrypoint files, never a module they delegate to', () => {
    for (const relativePath of BOOTSTRAP_EXCLUSIONS) {
      expect(relativePath).toMatch(/\/(main\.tsx|index\.ts)$/)
    }
  })
})

describe('the generated-code exemption', () => {
  it('covers only the directory `pnpm update:shadcn` owns', () => {
    expect(GENERATED_EXCLUSIONS).toEqual(['src/components/ui/**'])
  })
})
