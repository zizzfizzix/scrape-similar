import { updateStorageItem, withStorageLock } from '@/utils/storage-lock'
import log from 'loglevel'

/**
 * Atomically merge updates into a tab's session storage blob
 * Handles special logic for merging nested currentScrapeConfig
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: Partial<SidePanelConfig>,
): Promise<void> => {
  await updateStorageItem(sidePanelConfigItem(tabId), (stored) => {
    const current = stored || {}
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
    return next
  })
}

/**
 * Get session state for a tab
 */
export const getSessionState = async (tabId: number): Promise<SidePanelConfig | null> => {
  const item = sidePanelConfigItem(tabId)
  // Under the lock, so the read sees any merge already waiting for this tab.
  return await withStorageLock(item, () => item.getValue())
}

/**
 * Initialize default session state for a tab if it doesn't exist
 */
export const initializeSessionState = async (tabId: number): Promise<void> => {
  await updateStorageItem(sidePanelConfigItem(tabId), (existing) => {
    if (existing) return existing
    log.debug(`Initializing default session state for tab ${tabId}`)
    return {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
    }
  })
}

/**
 * Clear session state for a tab
 */
export const clearSessionState = async (tabId: number): Promise<void> => {
  const item = sidePanelConfigItem(tabId)
  try {
    // Under the lock, so an update still in flight lands before the removal
    // instead of re-creating the closed tab's config after it.
    await withStorageLock(item, () => item.removeValue())
    log.debug(`Cleared session state for tab ${tabId}`)
  } catch (error) {
    log.error(`Error clearing session state for tab ${tabId}:`, error)
  } finally {
    sidePanelConfigItem.forget(tabId)
  }
}
