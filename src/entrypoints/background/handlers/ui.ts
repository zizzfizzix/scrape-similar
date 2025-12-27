import log from 'loglevel'
import { handleDemoScrape } from '../services/demo-scrape'
import type { MessageHandler } from '../types'
import { handleExportToSheets } from './sheets-export'

/**
 * Handle OPEN_SIDEPANEL message from UI
 */
const handleOpenSidepanel: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to open sidepanel')
  try {
    const options: Partial<chrome.sidePanel.OpenOptions> = {}
    if (sender.tab?.id) options.tabId = sender.tab.id
    if (sender.tab?.windowId) options.windowId = sender.tab.windowId

    await chrome.sidePanel.open(options as chrome.sidePanel.OpenOptions)
    log.debug(
      `Sidepanel opened for ${sender.tab?.id ? `tab ${sender.tab.id}` : 'current active tab'}`,
    )
    sendResponse({ success: true })
  } catch (error) {
    log.error(`Error opening sidepanel:`, error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle EXPORT_TO_SHEETS message from UI
 */
const handleExportFromUi: MessageHandler = async (message, sender, sendResponse) => {
  await handleExportToSheets(message.payload, sendResponse, '🟡')
}

/**
 * Handle TRIGGER_DEMO_SCRAPE message from onboarding
 */
const handleDemoScrapeMessage: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('🎬 UI requested demo scrape from onboarding')
  await handleDemoScrape(sender, sendResponse)
}

/**
 * UI message handler registry
 */
const uiHandlers: Record<string, MessageHandler> = {
  [MESSAGE_TYPES.EXPORT_TO_SHEETS]: handleExportFromUi,
  [MESSAGE_TYPES.OPEN_SIDEPANEL]: handleOpenSidepanel,
  [MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE]: handleDemoScrapeMessage,
}

/**
 * Main UI message dispatcher
 */
export const handleUiMessage: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('🟡 handleUiMessage processing:', message.type)

  const handler = uiHandlers[message.type]
  if (handler) {
    try {
      await handler(message, sender, sendResponse)
    } catch (error) {
      log.error('Error handling UI message:', error)
      sendResponse({ success: false, error: (error as Error).message })
    }
  } else {
    log.debug('🟡 Unhandled UI message type:', message.type)
    log.warn(`Unhandled UI message type: ${message.type}`)
    sendResponse({ warning: 'Unhandled message type' })
  }
}
