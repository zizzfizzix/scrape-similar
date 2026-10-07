import type { QueuedEvent } from '@/utils/analytics'
import type { DistinctId } from '@/utils/distinct-id'
import log from 'loglevel'

/** Current version for user presets storage and export/import file format. */
export const USER_PRESETS_VERSION = 1

/** Migrations for user presets. Export for reuse in validatePresetImport (import of old file versions). */
export const PRESET_MIGRATIONS: Record<number, (oldValue: unknown) => Preset[]> = {
  // Future: 2: (old: PresetV1[]) => old.map(p => ({ ...p, newField: default }))
}

// Every storage key the extension reads or writes is declared here, once, with
// its type and its default. The keys are the ones the raw calls used before, so
// values stored by earlier versions still load. A `fallback` is returned by
// reference on every read, so copy an array or object before mutating it - the
// `get*` helpers below hand out copies for that reason.
//
// `/* @__PURE__ */` lets a bundle drop the items it never uses. `defineItem`
// reads its key (and runs migrations) the moment it is called, so without it
// every page the content script runs on would define and read all of them.

export const userPresetsItem = /* @__PURE__ */ storage.defineItem<Preset[]>('sync:user_presets', {
  version: USER_PRESETS_VERSION,
  fallback: [],
  migrations: PRESET_MIGRATIONS,
})

export const systemPresetStatusItem = /* @__PURE__ */ storage.defineItem<SystemPresetStatusMap>(
  'sync:system_preset_status',
  { fallback: {} },
)

export const recentMainSelectorsItem = /* @__PURE__ */ storage.defineItem<string[]>(
  'local:recent_main_selectors',
  {
    fallback: [],
  },
)

export const debugModeItem = /* @__PURE__ */ storage.defineItem<boolean>('local:debugMode', {
  fallback: false,
})

export const debugUnlockedItem = /* @__PURE__ */ storage.defineItem<boolean>(
  'local:debugUnlocked',
  {
    fallback: false,
  },
)

export const themeItem = /* @__PURE__ */ storage.defineItem<Theme>('local:theme', {
  fallback: 'system',
})

export const eventQueueItem = /* @__PURE__ */ storage.defineItem<QueuedEvent[]>(
  'local:event_queue',
  {
    fallback: [],
  },
)

/**
 * Older versions stored `null` or `''` here as well as a boolean, so the raw
 * value is typed loosely and `getConsentState` reads it into a `ConsentState`.
 */
export const analyticsConsentItem = /* @__PURE__ */ storage.defineItem<boolean | string>(
  'sync:analytics_consent',
)

/**
 * Deliberately no `init`: WXT runs it as soon as the item is defined, which
 * would create an id in every context that imports this module. The id must
 * only exist once a user has opted in — see `setupUninstallUrl`.
 */
export const distinctIdItem = /* @__PURE__ */ storage.defineItem<DistinctId>('local:distinct_id')

/**
 * `defineItem` reads its key once as soon as it is called, so a per-tab item is
 * defined on first use and reused after that rather than redefined per call.
 */
const definePerTab = <Item>(define: (tabId: number) => Item) => {
  const items = new Map<number, Item>()
  return (tabId: number): Item => {
    let item = items.get(tabId)
    if (!item) {
      item = define(tabId)
      items.set(tabId, item)
    }
    return item
  }
}

export const sidePanelConfigItem = definePerTab((tabId) =>
  storage.defineItem<SidePanelConfig>(`session:sidepanel_config_${tabId}`),
)

export const demoScrapePendingItem = definePerTab((tabId) =>
  storage.defineItem<ScrapeConfig>(`local:demo_scrape_pending_${tabId}`),
)

// Get presets from storage
export const getPresets = async (): Promise<Preset[]> => {
  try {
    return [...(await userPresetsItem.getValue())]
  } catch (error) {
    log.error('Error getting presets from storage:', error)
    return []
  }
}

// Save a preset to storage
export const savePreset = async (preset: Preset): Promise<boolean> => {
  try {
    const presets = await getPresets()

    // Check if preset with same ID exists
    const existingIndex = presets.findIndex((p) => p.id === preset.id)
    if (existingIndex !== -1) {
      // Update existing preset
      presets[existingIndex] = preset
    } else {
      // Add new preset
      presets.push(preset)
    }

    await userPresetsItem.setValue(presets)
    return true
  } catch (error) {
    log.error('Error saving preset to storage:', error)
    return false
  }
}

// Delete a preset from storage
export const deletePreset = async (presetId: string): Promise<boolean> => {
  try {
    const presets = await getPresets()
    const updatedPresets = presets.filter((p) => p.id !== presetId)

    await userPresetsItem.setValue(updatedPresets)
    return true
  } catch (error) {
    log.error('Error deleting preset from storage:', error)
    return false
  }
}

// Set all user presets (used by import). Replaces existing.
export const setPresets = async (presets: Preset[]): Promise<boolean> => {
  try {
    await userPresetsItem.setValue(presets)
    return true
  } catch (error) {
    log.error('Error setting presets in storage:', error)
    return false
  }
}

// Initialize storage with default values. With defineItem fallback, empty is handled; no-op for compatibility.
// `getPresets` swallows its own failures, so there is nothing here left to catch.
export const initializeStorage = async (): Promise<void> => {
  await getPresets()
}

// Get system preset status map from storage
export const getSystemPresetStatus = async (): Promise<SystemPresetStatusMap> => {
  try {
    return { ...(await systemPresetStatusItem.getValue()) }
  } catch (error) {
    log.error('Error getting system preset status from storage:', error)
    return {}
  }
}

// Set system preset status map in storage
export const setSystemPresetStatus = async (statusMap: SystemPresetStatusMap): Promise<void> => {
  try {
    await systemPresetStatusItem.setValue(statusMap)
  } catch (error) {
    log.error('Error setting system preset status in storage:', error)
  }
}

// Merge system presets with user presets, respecting status map
export const getAllPresets = async (): Promise<Preset[]> => {
  const [userPresets, statusMap] = await Promise.all([getPresets(), getSystemPresetStatus()])
  // Filter system presets by status (enabled by default)
  const enabledSystemPresets = SYSTEM_PRESETS.filter((preset) => statusMap[preset.id] !== false)
  // Merge: user presets first, then system presets
  return [...userPresets, ...enabledSystemPresets]
}

// -----------------------------------------------
// Recent main selectors (local area, capped to 5)
// -----------------------------------------------

/** The item is typed, not validated: anything but a list reads as no recents. */
export const toSelectorList = (stored: unknown): string[] =>
  Array.isArray(stored) ? [...stored] : []

export const getRecentMainSelectors = async (): Promise<string[]> => {
  try {
    const stored = await recentMainSelectorsItem.getValue()
    return toSelectorList(stored)
  } catch (error) {
    log.error('Error getting recent main selectors:', error)
    return []
  }
}

export const setRecentMainSelectors = async (selectors: string[]): Promise<void> => {
  try {
    await recentMainSelectorsItem.setValue(selectors)
  } catch (error) {
    log.error('Error setting recent main selectors:', error)
  }
}

// Both helpers this calls report their own storage failures and resolve, so a
// `catch` here could never run.
export const pushRecentMainSelector = async (selector: string): Promise<void> => {
  const current = await getRecentMainSelectors()
  const sanitized = selector.trim()
  if (!sanitized) return
  const withoutDup = current.filter((s) => s !== sanitized)
  const updated = [sanitized, ...withoutDup].slice(0, 5)
  await setRecentMainSelectors(updated)
}

// Unreachable `catch` for the same reason as `pushRecentMainSelector`.
export const removeRecentMainSelector = async (selector: string): Promise<void> => {
  const current = await getRecentMainSelectors()
  const updated = current.filter((s) => s !== selector)
  await setRecentMainSelectors(updated)
}
