import { applyColumnEdit, resolveStoredConfig } from '@/utils/scrape-config'
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
 * Atomically merge updates into a tab's session storage blob. A field that a
 * `currentScrapeConfig` update omits keeps the value the side panel shows for
 * the stored state (`resolveStoredConfig`), so the panel's own partial writes
 * never change a field the user did not edit. A `columnEdit` is applied to the
 * columns shown for the merged state, and dropped when it no longer matches.
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: SidePanelConfigUpdate,
): Promise<{ isColumnEditSuperseded: boolean }> => {
  let isColumnEditSuperseded = false
  if (isTabClosed(tabId, 'side panel update')) return { isColumnEditSuperseded }
  await updateStorageItem(sidePanelConfigItem(tabId), (stored) => {
    const current = stored ?? {}
    const { currentScrapeConfig: incoming, columnEdit, ...topLevel } = updates
    const next: SidePanelConfig = { ...current, ...topLevel }
    if (incoming && (incoming.mainSelector !== undefined || incoming.columns !== undefined)) {
      const shown = resolveStoredConfig(current)
      // Messages are not validated on receipt, so a selector that is not a
      // string or a column list that is not an array is dropped rather than stored.
      next.currentScrapeConfig = {
        mainSelector:
          typeof incoming.mainSelector === 'string' ? incoming.mainSelector : shown.mainSelector,
        columns: Array.isArray(incoming.columns) ? incoming.columns : shown.columns,
      }
    }
    if (columnEdit) {
      const shown = resolveStoredConfig(next)
      const columns = applyColumnEdit(shown.columns, columnEdit)
      if (columns) {
        next.currentScrapeConfig = { mainSelector: shown.mainSelector, columns }
      } else {
        log.debug(`Dropped superseded column edit for tab ${String(tabId)}`)
        isColumnEditSuperseded = true
        // An update carrying only the edit has nothing left to write.
        if (Object.keys(updates).length === 1) return stored
      }
    }
    return next
  })
  return { isColumnEditSuperseded }
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
