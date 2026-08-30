import { trackEvent } from '@/utils/analytics'
import log from 'loglevel'
import type { AsyncMessageHandler, MessageHandler } from '../types'
import { handleExportToSheets } from './sheets-export'

/**
 * Handle GET_MY_TAB_ID message - return tab ID to content script
 */
const handleGetTabId: MessageHandler = (message, sender, sendResponse) => {
  // `handleContentScriptMessage` refuses a sender without a tab id before it
  // reaches any handler, so there is always one here.
  const tabId = sender.tab!.id!
  log.debug(`Content script in tab ${tabId} requested its own tab ID`)
  sendResponse({ success: true, tabId })
}

/**
 * Handle TRACK_EVENT message - track analytics event from content script
 */
const handleTrackEvent: MessageHandler = (message, sender, sendResponse) => {
  const tabId = sender.tab?.id
  const { eventName, properties } = message.payload as TrackEventPayload
  if (eventName) {
    trackEvent(eventName, { ...properties })
    log.debug(`Tracked event from content script in tab ${tabId}: ${eventName}`)
    sendResponse({ success: true })
  } else {
    log.warn(`Invalid tracking event from content script in tab ${tabId}:`, message)
    sendResponse({ success: false, error: 'Invalid event name' })
  }
}

/**
 * Handle GET_DEBUG_MODE message - return current debug mode status
 */
const handleGetDebugMode: MessageHandler = async (message, sender, sendResponse) => {
  const tabId = sender.tab?.id
  log.debug(`Content script in tab ${tabId} requested debug mode status`)
  const isDebugModeEnabled = await storage.getItem<boolean>('local:debugMode')
  sendResponse({ success: true, debugMode: !!isDebugModeEnabled })
}

/**
 * Handle OPEN_SIDEPANEL message from content script
 */
const handleOpenSidepanel: MessageHandler = async (message, sender, sendResponse) => {
  // Guaranteed by `handleContentScriptMessage`, same as in `handleGetTabId`.
  const tab = sender.tab!
  const tabId = tab.id!
  log.debug(`Content script in tab ${tabId} requested to open sidepanel`)
  try {
    const options: Partial<Browser.sidePanel.OpenOptions> = { tabId }
    // A tab reported by a content script may still predate its window being
    // known, in which case the side panel opens against the active window.
    if (tab.windowId) options.windowId = tab.windowId

    await browser.sidePanel.open(options as Browser.sidePanel.OpenOptions)
    log.debug(`Sidepanel opened for tab ${tabId}`)
    sendResponse({ success: true })
  } catch (error) {
    log.error(`Error opening sidepanel:`, error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle EXPORT_TO_SHEETS message from content script
 */
const handleExportFromContent: MessageHandler = async (message, sender, sendResponse) => {
  await handleExportToSheets(message.payload, sendResponse, '🔵')
}

/**
 * Content script message handler registry
 */
const contentScriptHandlers: Record<string, MessageHandler> = {
  [MESSAGE_TYPES.GET_MY_TAB_ID]: handleGetTabId,
  [MESSAGE_TYPES.TRACK_EVENT]: handleTrackEvent,
  [MESSAGE_TYPES.GET_DEBUG_MODE]: handleGetDebugMode,
  [MESSAGE_TYPES.EXPORT_TO_SHEETS]: handleExportFromContent,
  [MESSAGE_TYPES.OPEN_SIDEPANEL]: handleOpenSidepanel,
}

/**
 * Main content script message dispatcher
 */
export const handleContentScriptMessage: AsyncMessageHandler = async (
  message,
  sender,
  sendResponse,
) => {
  const tabId = sender.tab?.id
  if (!tabId) {
    log.error('No tab ID available for content script message')
    sendResponse({ success: false, error: 'No tab ID available' })
    return
  }

  log.debug(`Handling message from content script in tab ${tabId}:`, message)

  const handler = contentScriptHandlers[message.type]
  if (handler) {
    try {
      await handler(message, sender, sendResponse)
    } catch (error) {
      log.error(`Error handling content script message for tab ${tabId}:`, error)
      sendResponse({ success: false, error: (error as Error).message })
    }
  } else {
    log.debug('🔵 Unhandled content script message type:', message.type)
    log.warn(`Unhandled content script message type for tab ${tabId}: ${message.type}`)
    sendResponse({ success: false, warning: 'Unhandled message type' })
  }
}
