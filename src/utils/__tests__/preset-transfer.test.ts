import {
  buildPresetExportJson,
  describeImportSuccess,
  HIDDEN_UNLOCK_CLICKS,
  HIDDEN_UNLOCK_WINDOW_MS,
  PRESET_EXPORT_FILENAME,
  PRESET_EXPORT_MIME_TYPE,
  readPresetFile,
} from '@/utils/preset-transfer'
import { USER_PRESETS_VERSION } from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import type { Preset } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const preset = (overrides: Partial<Preset> = {}): Preset => ({
  id: 'p1',
  name: 'Links',
  config: { mainSelector: '//a', columns: [{ name: 'URL', selector: '@href' }] },
  createdAt: 1_700_000_000_000,
  ...overrides,
})

/** A stand-in for the File the picker hands over. */
const fileWith = (text: string) => ({ text: () => Promise.resolve(text) })

describe('buildPresetExportJson', () => {
  it('stamps the current format version', () => {
    const parsed = JSON.parse(buildPresetExportJson([preset()]))

    expect(parsed.version).toBe(USER_PRESETS_VERSION)
    expect(parsed.presets).toEqual([preset()])
  })

  it('exports an empty list as an empty array', () => {
    expect(JSON.parse(buildPresetExportJson([])).presets).toEqual([])
  })

  it('formats the file for a human to edit before re-importing', () => {
    expect(buildPresetExportJson([])).toBe(
      `{\n  "version": ${USER_PRESETS_VERSION},\n  "presets": []\n}`,
    )
  })

  it('round-trips through readPresetFile', async () => {
    const json = buildPresetExportJson([preset()])

    await expect(readPresetFile(fileWith(json))).resolves.toEqual({
      ok: true,
      presets: [preset()],
      skippedSystemCount: 0,
    })
  })
})

describe('readPresetFile', () => {
  it('accepts a valid export', async () => {
    const outcome = await readPresetFile(
      fileWith(JSON.stringify({ version: 1, presets: [preset()] })),
    )

    expect(outcome).toEqual({ ok: true, presets: [preset()], skippedSystemCount: 0 })
  })

  it('reports how many system presets it skipped', async () => {
    const [systemPreset] = SYSTEM_PRESETS
    const outcome = await readPresetFile(
      fileWith(JSON.stringify({ version: 1, presets: [preset(), systemPreset] })),
    )

    expect(outcome).toEqual({ ok: true, presets: [preset()], skippedSystemCount: 1 })
  })

  it('rejects malformed JSON with the parser’s reason', async () => {
    const outcome = await readPresetFile(fileWith('{ not json'))

    expect(outcome.ok).toBe(false)
    expect((outcome as { error: string }).error).toMatch(/^Failed to read preset file: /)
  })

  it('rejects a file it cannot read', async () => {
    const outcome = await readPresetFile({
      text: () => Promise.reject(new Error('permission denied')),
    })

    expect(outcome).toEqual({
      ok: false,
      error: 'Failed to read preset file: permission denied',
    })
  })

  it('falls back to a generic reason when the failure is not an error', async () => {
    const outcome = await readPresetFile({ text: () => Promise.reject('nope') })

    expect(outcome).toEqual({ ok: false, error: 'Failed to read preset file: Invalid JSON' })
  })

  it('passes a validation failure through unchanged', async () => {
    const outcome = await readPresetFile(fileWith(JSON.stringify({ presets: [] })))

    expect(outcome).toEqual({
      ok: false,
      error: 'Invalid preset file: missing "version" field.',
    })
  })

  it('rejects a payload that is not an object', async () => {
    const outcome = await readPresetFile(fileWith('"just a string"'))

    expect(outcome).toEqual({ ok: false, error: 'Invalid preset file: expected an object.' })
  })
})

describe('describeImportSuccess', () => {
  it('reports the count when nothing was skipped', () => {
    expect(describeImportSuccess(3, 0)).toBe('Imported 3 presets.')
  })

  it('notes the skipped system presets', () => {
    expect(describeImportSuccess(3, 2)).toBe('Imported 3 presets. 2 (system) presets were skipped.')
  })

  it('reports an import that added nothing', () => {
    expect(describeImportSuccess(0, 0)).toBe('Imported 0 presets.')
  })
})

describe('transfer constants', () => {
  it('names the export file and its type', () => {
    expect(PRESET_EXPORT_FILENAME).toBe('scrape-similar-presets.json')
    expect(PRESET_EXPORT_MIME_TYPE).toBe('application/json')
  })

  it('needs five clicks within five seconds to unlock', () => {
    expect(HIDDEN_UNLOCK_CLICKS).toBe(5)
    expect(HIDDEN_UNLOCK_WINDOW_MS).toBe(5_000)
  })
})
