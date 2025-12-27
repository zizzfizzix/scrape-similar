import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'

/**
 * Broadcast debug mode changes to all open tabs
 */
export const broadcastDebugMode = async (debugValue: boolean): Promise<void> => {
  try {
    const tabs = await browser.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs
          .sendMessage(tab.id, {
            type: MESSAGE_TYPES.DEBUG_MODE_CHANGED,
            payload: { debugMode: debugValue },
          })
          .catch(() => {
            /* ignore errors for tabs without listener */
          })
      }
    }
  } catch (error) {
    log.warn('Error broadcasting debugMode change:', error)
  }
}

/**
 * Set up debug mode watchers and initialize log level
 */
export const initializeDebugMode = async (): Promise<void> => {
  // Always log at trace level in development or test mode
  if (isDevOrTest) {
    log.setLevel('trace')
  } else {
    // Initialise log level from persistent storage
    const debugMode = await storage.getItem<boolean>('local:debugMode')
    log.setLevel(debugMode ? 'trace' : 'error')
  }

  // React to debugMode changes
  storage.watch<boolean>('local:debugMode', (debugMode) => {
    if (!isDevOrTest) {
      log.setLevel(debugMode ? 'trace' : 'error')
    }
    broadcastDebugMode(!!debugMode)
  })
}
