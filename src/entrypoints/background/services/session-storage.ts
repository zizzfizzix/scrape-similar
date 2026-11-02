import { DEFAULT_SCRAPE_CONFIG } from '@/utils/sidepanel-state'
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
 * Atomically merge updates into a tab's session storage blob. A partial
 * `currentScrapeConfig` is merged field by field into the stored one; with
 * nothing stored, a missing field takes the default the side panel shows.
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: SidePanelConfigUpdate,
): Promise<void> => {
  if (isTabClosed(tabId, 'side panel update')) return
  await updateStorageItem(sidePanelConfigItem(tabId), (stored) => {
    const current = stored || {}
    const { currentScrapeConfig: incoming, ...topLevel } = updates
    const next: SidePanelConfig = { ...current, ...topLevel }
    if (incoming) {
      const prevConfig = current.currentScrapeConfig
      next.currentScrapeConfig = {
        mainSelector: incoming.mainSelector ?? prevConfig?.mainSelector ?? '',
        columns: incoming.columns ?? prevConfig?.columns ?? DEFAULT_SCRAPE_CONFIG.columns,
      }
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
