import { isSystemPreset } from '@/utils/isSystemPreset'
import { PRESET_MIGRATIONS, USER_PRESETS_VERSION } from '@/utils/storage'
import type { ColumnDefinition, Preset, ScrapeConfig } from '@/utils/types'

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0
}

function isNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function isColumnDefinition(x: unknown): x is ColumnDefinition {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return isNonEmptyString(o.name) && typeof o.selector === 'string'
}

function isScrapeConfig(x: unknown): x is ScrapeConfig {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (!isNonEmptyString(o.mainSelector)) return false
  if (!Array.isArray(o.columns)) return false
  return o.columns.every(isColumnDefinition)
}

function isPreset(x: unknown): x is Preset {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    isNonEmptyString(o.id) &&
    isNonEmptyString(o.name) &&
    isScrapeConfig(o.config) &&
    isNumber(o.createdAt)
  )
}

/**
 * Validates parsed import JSON and returns presets plus count of skipped system presets.
 * Uses same version and migrations as storage (USER_PRESETS_VERSION, PRESET_MIGRATIONS).
 */
export function validatePresetImport(
  data: unknown,
): { presets: Preset[]; skippedSystemCount: number } | { error: string } {
  if (data === null || typeof data !== 'object') {
    return { error: 'Invalid preset file: expected an object.' }
  }

  const obj = data as Record<string, unknown>

  if (obj.version === undefined) {
    return { error: 'Invalid preset file: missing "version" field.' }
  }
  const version = obj.version
  if (!isNumber(version) || version < 1 || version > USER_PRESETS_VERSION) {
    return {
      error: `Unsupported preset file version. Expected version between 1 and ${USER_PRESETS_VERSION}.`,
    }
  }

  if (obj.presets === undefined) {
    return { error: 'Invalid preset file: missing "presets" field.' }
  }
  if (!Array.isArray(obj.presets)) {
    return { error: 'Invalid preset file: "presets" must be an array.' }
  }

  let candidates: unknown[] = obj.presets

  // Run migrations from file version to current
  for (let v = version + 1; v <= USER_PRESETS_VERSION; v++) {
    const migrate = PRESET_MIGRATIONS[v]
    if (!migrate) {
      return {
        error: `Unsupported preset file version: migration to v${v} not defined.`,
      }
    }
    try {
      candidates = migrate(candidates) as unknown[]
    } catch (err) {
      return {
        error: `Failed to migrate presets: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  const valid: Preset[] = []
  let skippedSystemCount = 0

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i]
    if (!isPreset(item)) {
      return {
        error: `Invalid preset at index ${i}: missing or invalid fields (id, name, config.mainSelector, config.columns, createdAt).`,
      }
    }
    if (isSystemPreset(item)) {
      skippedSystemCount += 1
      continue
    }
    valid.push(item)
  }

  return { presets: valid, skippedSystemCount }
}
