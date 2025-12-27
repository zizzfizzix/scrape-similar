import { getStorageMutex } from '@/utils/session-mutex'
import log from 'loglevel'

/**
 * Generate session storage key for a specific tab
 */
export const getSessionKey = (tabId: number): string => `sidepanel_config_${tabId}`

/**
 * Atomically merge updates into a tab's session storage blob
 * Handles special logic for merging nested currentScrapeConfig
 */
export const applySidePanelDataUpdates = async (
  tabId: number,
  updates: Partial<SidePanelConfig>,
): Promise<void> => {
  const sessionKey = getSessionKey(tabId)
  const mutex = getStorageMutex(sessionKey)
  await mutex.runExclusive(async () => {
    const current = (await storage.getItem<SidePanelConfig>(`session:${sessionKey}`)) || {}
    // Shallow-merge top-level, but carefully merge nested config to avoid losing fields
    const next: SidePanelConfig = { ...current, ...updates }
    if (updates.currentScrapeConfig) {
      const prevConfig = current.currentScrapeConfig || ({} as ScrapeConfig)
      const incoming = updates.currentScrapeConfig
      // If mainSelector changed, we keep existing columns from prev unless incoming explicitly provides columns
      const selectorChanged =
        typeof incoming.mainSelector === 'string' &&
        incoming.mainSelector !== prevConfig.mainSelector
      const shouldUseIncomingColumns = Array.isArray(incoming.columns)
      const mergedColumns = shouldUseIncomingColumns
        ? (incoming.columns as ColumnDefinition[])
        : selectorChanged
          ? prevConfig.columns || []
          : prevConfig.columns || []

      const merged: ScrapeConfig = {
        ...prevConfig,
        ...incoming,
        columns: mergedColumns,
      }
      next.currentScrapeConfig = merged
    }
    await storage.setItem(`session:${sessionKey}`, next)
  })
}

/**
 * Get session state for a tab
 */
export const getSessionState = async (tabId: number): Promise<SidePanelConfig | null> => {
  const sessionKey = getSessionKey(tabId)
  const mutex = getStorageMutex(sessionKey)
  return await mutex.runExclusive(async () =>
    storage.getItem<SidePanelConfig>(`session:${sessionKey}`),
  )
}

/**
 * Initialize default session state for a tab if it doesn't exist
 */
export const initializeSessionState = async (tabId: number): Promise<void> => {
  const sessionKey = getSessionKey(tabId)
  const mutex = getStorageMutex(sessionKey)
  const existing = await mutex.runExclusive(async () =>
    storage.getItem<Partial<SidePanelConfig>>(`session:${sessionKey}`),
  )
  if (!existing) {
    const defaultPanelState: Partial<SidePanelConfig> = {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
    }
    log.debug(`Initializing default session state for tab ${tabId}`)
    await mutex.runExclusive(async () => {
      await storage.setItem(`session:${sessionKey}`, defaultPanelState)
    })
  }
}

/**
 * Clear session state for a tab
 */
export const clearSessionState = async (tabId: number): Promise<void> => {
  const sessionKey = getSessionKey(tabId)
  try {
    await storage.removeItem(`session:${sessionKey}`)
    log.debug(`Cleared session state for tab ${tabId}`)
  } catch (error) {
    log.error(`Error clearing session state for tab ${tabId}:`, error)
  }
}
