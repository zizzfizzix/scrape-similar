import { USER_PRESETS_VERSION } from '@/utils/storage'
import { validatePresetImport } from '@/utils/validatePresets'

/**
 * Reading and writing the preset export file.
 *
 * Split out of `Settings.tsx` so the file format and the messages the user sees
 * can be asserted without a file picker.
 */

export const PRESET_EXPORT_FILENAME = 'scrape-similar-presets.json'
export const PRESET_EXPORT_MIME_TYPE = 'application/json'

/** How many title clicks reveal the hidden debug row. */
export const HIDDEN_UNLOCK_CLICKS = 5

/** How long the click run may take before it resets. */
export const HIDDEN_UNLOCK_WINDOW_MS = 5_000

/** The exported file's contents: the current format version plus the presets. */
export const buildPresetExportJson = (presets: Preset[]): string =>
  JSON.stringify({ version: USER_PRESETS_VERSION, presets }, null, 2)

export type PresetImportOutcome =
  { ok: true; presets: Preset[]; skippedSystemCount: number } | { ok: false; error: string }

/**
 * Parse and validate a preset file the user chose.
 *
 * Reports one message for anything that goes wrong — unreadable file, malformed
 * JSON, or a payload that is not a preset export — since the user's next step is
 * the same either way.
 */
export const readPresetFile = async (file: {
  text: () => Promise<string>
}): Promise<PresetImportOutcome> => {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    return { ok: false, error: `Failed to read preset file: ${message}` }
  }

  const validation = validatePresetImport(data)
  if ('error' in validation) return { ok: false, error: validation.error }

  return {
    ok: true,
    presets: validation.presets,
    skippedSystemCount: validation.skippedSystemCount,
  }
}

/** Confirmation shown after a successful import, noting anything skipped. */
export const describeImportSuccess = (presetCount: number, skippedSystemCount: number): string =>
  skippedSystemCount > 0
    ? `Imported ${presetCount} presets. ${skippedSystemCount} (system) presets were skipped.`
    : `Imported ${presetCount} presets.`
