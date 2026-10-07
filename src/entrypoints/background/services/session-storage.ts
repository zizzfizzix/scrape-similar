import { getStorageMutex } from '@/utils/session-mutex'
import log from 'loglevel'

/**
 * Atomically merge updates into a tab's session storage blob
 * Handles special logic for merging nested currentScrapeConfig
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: Partial<SidePanelConfig>,
): Promise<void> => {
  const item = sidePanelConfigItem(tabId)
  const mutex = getStorageMutex(item.key)
  await mutex.runExclusive(async () => {
    const current = (await item.getValue()) || {}
    // Shallow-merge top-level, but carefully merge nested config to avoid losing fields
    const next: SidePanelConfig = { ...current, ...updates }
    if (updates.currentScrapeConfig) {
      const prevConfig = current.currentScrapeConfig || ({} as ScrapeConfig)
      const incoming = updates.currentScrapeConfig
      // A write that omits `columns` keeps the ones already stored, whether or
      // not it also changes `mainSelector`.
      const shouldUseIncomingColumns = Array.isArray(incoming.columns)
      const mergedColumns = shouldUseIncomingColumns
        ? (incoming.columns as ColumnDefinition[])
        : prevConfig.columns || []

      const merged: ScrapeConfig = {
        ...prevConfig,
        ...incoming,
        columns: mergedColumns,
      }
      next.currentScrapeConfig = merged
    }
    await item.setValue(next)
  })
}

/**
 * Get session state for a tab
 */
export const getSessionState = async (tabId: number): Promise<SidePanelConfig | null> => {
  const item = sidePanelConfigItem(tabId)
  const mutex = getStorageMutex(item.key)
  return await mutex.runExclusive(async () => item.getValue())
}

/**
 * Initialize default session state for a tab if it doesn't exist
 */
export const initializeSessionState = async (tabId: number): Promise<void> => {
  const item = sidePanelConfigItem(tabId)
  const mutex = getStorageMutex(item.key)
  const existing = await mutex.runExclusive(async () => item.getValue())
  if (!existing) {
    const defaultPanelState: SidePanelConfig = {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
    }
    log.debug(`Initializing default session state for tab ${tabId}`)
    await mutex.runExclusive(async () => {
      await item.setValue(defaultPanelState)
    })
  }
}

/**
 * Clear session state for a tab
 */
export const clearSessionState = async (tabId: number): Promise<void> => {
  try {
    await sidePanelConfigItem(tabId).removeValue()
    log.debug(`Cleared session state for tab ${tabId}`)
  } catch (error) {
    log.error(`Error clearing session state for tab ${tabId}:`, error)
  }
}
