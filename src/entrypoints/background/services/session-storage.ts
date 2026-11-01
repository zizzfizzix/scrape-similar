import { withStorageLock } from '@/utils/storage-lock'
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
  await withStorageLock(item, async () => {
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
  return await item.getValue()
}

/**
 * Initialize default session state for a tab if it doesn't exist
 */
export const initializeSessionState = async (tabId: number): Promise<void> => {
  const item = sidePanelConfigItem(tabId)
  // Read and write under one lock, so an update queued between them is not
  // overwritten with the defaults.
  await withStorageLock(item, async () => {
    const existing = await item.getValue()
    if (existing) return
    const defaultPanelState: SidePanelConfig = {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
    }
    log.debug(`Initializing default session state for tab ${tabId}`)
    await item.setValue(defaultPanelState)
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
