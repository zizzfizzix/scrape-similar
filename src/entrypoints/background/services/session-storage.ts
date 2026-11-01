import { updateStorageItem, withStorageLock } from '@/utils/storage-lock'
import log from 'loglevel'

// Browsers never reuse a tab id within a session, so an id stays closed for as
// long as this worker lives. A tab's id is added before its clear requests the
// lock: an update that requests it later is refused, and one already waiting
// lands before the removal. A restarted worker starts with an empty set, so an
// update for a tab closed before the restart is written.
const closedTabIds = new Set<number>()

const isTabClosed = (tabId: number, operation: string): boolean => {
  if (!closedTabIds.has(tabId)) return false
  log.debug(`Dropped ${operation} for closed tab ${tabId}`)
  return true
}

/**
 * Atomically merge updates into a tab's session storage blob
 * Handles special logic for merging nested currentScrapeConfig
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: Partial<SidePanelConfig>,
): Promise<void> => {
  if (isTabClosed(tabId, 'side panel update')) return
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
  if (isTabClosed(tabId, 'session state initialization')) return
  await updateStorageItem(sidePanelConfigItem(tabId), (existing) => {
    if (existing) return existing
    log.debug(`Initializing default session state for tab ${tabId}`)
    return {
      elementDetails: undefined,
      currentScrapeConfig: undefined,
    }
  })
}

/**
 * Clear session state for a tab
 */
export const clearSessionState = async (tabId: number): Promise<void> => {
  closedTabIds.add(tabId)
  const item = sidePanelConfigItem(tabId)
  try {
    await withStorageLock(item, () => item.removeValue())
    log.debug(`Cleared session state for tab ${tabId}`)
  } catch (error) {
    log.error(`Error clearing session state for tab ${tabId}:`, error)
  } finally {
    sidePanelConfigItem.forget(tabId)
  }
}
