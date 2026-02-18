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

describe('validatePresetImport', () => {
  it('accepts valid version 1 and presets array', () => {
    const result = validatePresetImport({ version: 1, presets: [validPreset] })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets).toHaveLength(1)
      expect(result.presets[0]).toEqual(validPreset)
      expect(result.skippedSystemCount).toBe(0)
    }
  })

  it('returns empty presets and zero skipped for empty array', () => {
    const result = validatePresetImport({ version: 1, presets: [] })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets).toHaveLength(0)
      expect(result.skippedSystemCount).toBe(0)
    }
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
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Unsupported')
    }
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
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toMatch(/Invalid preset at index 0/)
    }
  })

  it('filters out system preset IDs and sets skippedSystemCount', () => {
    const systemPresetId = SYSTEM_PRESETS[0].id
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
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets).toHaveLength(1)
      expect(result.presets[0].id).toBe(validPreset.id)
      expect(result.skippedSystemCount).toBe(1)
    }
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
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets).toHaveLength(2)
      expect(result.skippedSystemCount).toBe(0)
    }
  })
})
