import { SYSTEM_PRESETS } from '@/utils/system_presets'
import type { Preset } from '@/utils/types'
import { validatePresetImport } from '@/utils/validatePresets'
import { describe, expect, it } from 'vitest'

const validPreset: Preset = {
  id: 'user-1',
  name: 'My Preset',
  config: {
    mainSelector: '//div',
    columns: [
      { name: 'Title', selector: './/h2' },
      { name: 'Link', selector: '@href' },
    ],
  },
  createdAt: 1234567890,
}

type ImportResult = ReturnType<typeof validatePresetImport>

/**
 * The `in` narrowing a test needs before it can read a branch's fields, kept
 * out of the tests themselves so that their assertions are not conditional.
 */
const accepted = (result: ImportResult) => {
  if ('error' in result) throw new Error(`Expected an accepted import, got: ${result.error}`)
  return result
}

const rejected = (result: ImportResult) => {
  if (!('error' in result)) throw new Error('Expected the import to be rejected')
  return result
}

describe('validatePresetImport', () => {
  it('accepts valid version 1 and presets array', () => {
    const result = accepted(validatePresetImport({ version: 1, presets: [validPreset] }))

    expect(result.presets).toHaveLength(1)
    expect(result.presets[0]).toEqual(validPreset)
    expect(result.skippedSystemCount).toBe(0)
  })

  it('returns empty presets and zero skipped for empty array', () => {
    const result = accepted(validatePresetImport({ version: 1, presets: [] }))

    expect(result.presets).toHaveLength(0)
    expect(result.skippedSystemCount).toBe(0)
  })

  it('returns error when data is not an object', () => {
    expect(validatePresetImport(null)).toEqual({
      error: 'Invalid preset file: expected an object.',
    })
    expect(validatePresetImport(42)).toEqual({
      error: 'Invalid preset file: expected an object.',
    })
    expect(validatePresetImport('string')).toEqual({
      error: 'Invalid preset file: expected an object.',
    })
  })

  it('returns error when version is missing', () => {
    const result = validatePresetImport({ presets: [] })
    expect(result).toEqual({ error: 'Invalid preset file: missing "version" field.' })
  })

  it('returns error when version is unsupported (future)', () => {
    const result = validatePresetImport({ version: 99, presets: [] })
    expect(rejected(result).error).toContain('Unsupported')
  })

  it('returns error when version is invalid type', () => {
    const result = validatePresetImport({ version: '1', presets: [] })
    expect('error' in result).toBe(true)
  })

  it('returns error when presets is missing', () => {
    const result = validatePresetImport({ version: 1 })
    expect(result).toEqual({ error: 'Invalid preset file: missing "presets" field.' })
  })

  it('returns error when presets is not an array', () => {
    const result = validatePresetImport({ version: 1, presets: {} })
    expect(result).toEqual({ error: 'Invalid preset file: "presets" must be an array.' })
  })

  it('returns error when preset at index has invalid structure', () => {
    const result = validatePresetImport({
      version: 1,
      presets: [
        { id: 'x', name: 'Y' }, // missing config, createdAt
      ],
    })
    expect(rejected(result).error).toMatch(/Invalid preset at index 0/)
  })

  it('filters out system preset IDs and sets skippedSystemCount', () => {
    const [systemPreset] = SYSTEM_PRESETS
    if (!systemPreset) {
      throw new Error('Expected at least one system preset')
    }
    const systemPresetId = systemPreset.id
    const result = validatePresetImport({
      version: 1,
      presets: [
        validPreset,
        {
          ...validPreset,
          id: systemPresetId,
          name: 'Copy of system',
        },
      ],
    })
    const importedPresets = accepted(result)

    expect(importedPresets.presets).toHaveLength(1)
    expect(importedPresets.presets[0]?.id).toBe(validPreset.id)
    expect(importedPresets.skippedSystemCount).toBe(1)
  })

  it('validates config has mainSelector and columns', () => {
    const result = validatePresetImport({
      version: 1,
      presets: [
        {
          id: 'x',
          name: 'Y',
          config: { mainSelector: '', columns: [] },
          createdAt: 0,
        },
      ],
    })
    expect('error' in result).toBe(true)
  })

  it('accepts multiple valid presets', () => {
    const preset2: Preset = { ...validPreset, id: 'user-2', name: 'Second' }
    const result = validatePresetImport({
      version: 1,
      presets: [validPreset, preset2],
    })
    const importedPresets = accepted(result)

    expect(importedPresets.presets).toHaveLength(2)
    expect(importedPresets.skippedSystemCount).toBe(0)
  })
})

describe('validatePresetImport null guards', () => {
  const invalidPresetError =
    'Invalid preset at index 0: missing or invalid fields (id, name, config.mainSelector, config.columns, createdAt).'

  it('rejects a null entry in the presets array', () => {
    expect(validatePresetImport({ version: 1, presets: [null] })).toEqual({
      error: invalidPresetError,
    })
  })

  it('rejects a preset whose config is null', () => {
    expect(
      validatePresetImport({
        version: 1,
        presets: [{ id: 'p', name: 'P', config: null, createdAt: 1 }],
      }),
    ).toEqual({ error: invalidPresetError })
  })

  it('rejects a preset with a null column', () => {
    expect(
      validatePresetImport({
        version: 1,
        presets: [
          {
            id: 'p',
            name: 'P',
            config: { mainSelector: '//a', columns: [null] },
            createdAt: 1,
          },
        ],
      }),
    ).toEqual({ error: invalidPresetError })
  })

  it('rejects null data', () => {
    expect(validatePresetImport(null)).toEqual({
      error: 'Invalid preset file: expected an object.',
    })
  })
})

describe('validatePresetImport column shape', () => {
  it('rejects a config whose columns field is not an array', () => {
    expect(
      validatePresetImport({
        version: 1,
        presets: [
          { id: 'p', name: 'P', config: { mainSelector: '//a', columns: 'nope' }, createdAt: 1 },
        ],
      }),
    ).toEqual({
      error:
        'Invalid preset at index 0: missing or invalid fields (id, name, config.mainSelector, config.columns, createdAt).',
    })
  })
})
