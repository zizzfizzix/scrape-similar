import type { Preset } from '@/utils/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shipped format is at v1 with no migrations defined, so the migration loop
 * in `validatePresetImport` is only reachable with a higher current version.
 * These tests stand in a future v3 to exercise it.
 */
const storageMock = vi.hoisted(() => ({
  USER_PRESETS_VERSION: 3,
  PRESET_MIGRATIONS: {} as Record<number, (old: unknown) => Preset[]>,
}))
vi.mock('@/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/storage')>()),
  get USER_PRESETS_VERSION() {
    return storageMock.USER_PRESETS_VERSION
  },
  get PRESET_MIGRATIONS() {
    return storageMock.PRESET_MIGRATIONS
  },
}))

const { validatePresetImport } = await import('@/utils/validatePresets')

const preset = (overrides: Partial<Preset> = {}): Preset => ({
  id: 'p1',
  name: 'Links',
  config: { mainSelector: '//a', columns: [{ name: 'URL', selector: '@href' }] },
  createdAt: 1_700_000_000_000,
  ...overrides,
})

describe('validatePresetImport migrations', () => {
  beforeEach(() => {
    storageMock.PRESET_MIGRATIONS = {}
  })

  it('runs every migration between the file version and the current one', () => {
    const applied: number[] = []
    storageMock.PRESET_MIGRATIONS = {
      2: (old) => {
        applied.push(2)
        return old as Preset[]
      },
      3: (old) => {
        applied.push(3)
        return (old as Preset[]).map((p) => ({ ...p, name: `${p.name} v3` }))
      },
    }

    const result = validatePresetImport({ version: 1, presets: [preset()] })

    expect(applied).toEqual([2, 3])
    expect(result).toEqual({ presets: [preset({ name: 'Links v3' })], skippedSystemCount: 0 })
  })

  it('runs only the migrations still outstanding', () => {
    const applied: number[] = []
    storageMock.PRESET_MIGRATIONS = {
      2: (old) => {
        applied.push(2)
        return old as Preset[]
      },
      3: (old) => {
        applied.push(3)
        return old as Preset[]
      },
    }

    validatePresetImport({ version: 2, presets: [preset()] })

    expect(applied).toEqual([3])
  })

  it('runs no migrations for a file already at the current version', () => {
    const migrate = vi.fn((old: unknown) => old as Preset[])
    storageMock.PRESET_MIGRATIONS = { 2: migrate, 3: migrate }

    const result = validatePresetImport({ version: 3, presets: [preset()] })

    expect(migrate).not.toHaveBeenCalled()
    expect(result).toEqual({ presets: [preset()], skippedSystemCount: 0 })
  })

  it('reports a missing migration step', () => {
    storageMock.PRESET_MIGRATIONS = { 3: (old) => old as Preset[] }

    expect(validatePresetImport({ version: 1, presets: [preset()] })).toEqual({
      error: 'Unsupported preset file version: migration to v2 not defined.',
    })
  })

  it('reports the message of a migration that throws', () => {
    storageMock.PRESET_MIGRATIONS = {
      2: () => {
        throw new Error('column shape changed')
      },
      3: (old) => old as Preset[],
    }

    expect(validatePresetImport({ version: 1, presets: [preset()] })).toEqual({
      error: 'Failed to migrate presets: column shape changed',
    })
  })

  it('stringifies a migration that throws a non-error', () => {
    storageMock.PRESET_MIGRATIONS = {
      2: () => {
        throw 'unexpected shape'
      },
      3: (old) => old as Preset[],
    }

    expect(validatePresetImport({ version: 1, presets: [preset()] })).toEqual({
      error: 'Failed to migrate presets: unexpected shape',
    })
  })

  it('validates the migrated presets, not the originals', () => {
    storageMock.PRESET_MIGRATIONS = {
      2: (old) => old as Preset[],
      3: () => [{ id: 'broken' } as Preset],
    }

    expect(validatePresetImport({ version: 1, presets: [preset()] })).toEqual({
      error:
        'Invalid preset at index 0: missing or invalid fields (id, name, config.mainSelector, config.columns, createdAt).',
    })
  })

  it('rejects a file newer than the current version', () => {
    expect(validatePresetImport({ version: 4, presets: [] })).toEqual({
      error: 'Unsupported preset file version. Expected version between 1 and 3.',
    })
  })
})
