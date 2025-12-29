import {
  cancelBatchScrape,
  pauseBatchScrape,
  resumeBatchScrape,
  retryUrl,
  startBatchScrape,
} from '@/entrypoints/background/handlers/batch-scrape'
import { handleExportToSheets } from '@/entrypoints/background/handlers/sheets-export'
import { handleDemoScrape } from '@/entrypoints/background/services/demo-scrape'
import type { MessageHandler } from '@/entrypoints/background/types'
import log from 'loglevel'

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
 * Handle OPEN_BATCH_SCRAPE message from UI
 */
const handleOpenBatchScrape: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to open batch scrape page')
  try {
    const payload = message.payload as OpenBatchScrapePayload | undefined
    const url = new URL(browser.runtime.getURL('/batch-scrape.html'))

    // Add config or batchId to URL params
    if (payload?.config) {
      url.searchParams.set('config', JSON.stringify(payload.config))
    }
    if (payload?.batchId) {
      url.searchParams.set('batchId', payload.batchId)
    }

    // Create new tab with batch scrape page
    await browser.tabs.create({ url: url.toString() })
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error opening batch scrape page:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle OPEN_BATCH_SCRAPE_HISTORY message from UI
 */
const handleOpenBatchScrapeHistory: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to open batch scrape history page')
  try {
    const url = browser.runtime.getURL('/batch-scrape-history.html')
    await browser.tabs.create({ url })
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error opening batch scrape history page:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle BATCH_SCRAPE_START message from UI
 */
const handleBatchScrapeStart: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to start batch scrape')
  try {
    const payload = message.payload as BatchScrapeStartPayload
    await startBatchScrape(payload.batchId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error starting batch scrape:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle BATCH_SCRAPE_PAUSE message from UI
 */
const handleBatchScrapePause: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to pause batch scrape')
  try {
    const payload = message.payload as BatchScrapeStartPayload
    await pauseBatchScrape(payload.batchId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error pausing batch scrape:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle BATCH_SCRAPE_RESUME message from UI
 */
const handleBatchScrapeResume: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to resume batch scrape')
  try {
    const payload = message.payload as BatchScrapeStartPayload
    await resumeBatchScrape(payload.batchId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error resuming batch scrape:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle BATCH_SCRAPE_CANCEL message from UI
 */
const handleBatchScrapeCancel: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to cancel batch scrape')
  try {
    const payload = message.payload as BatchScrapeStartPayload
    await cancelBatchScrape(payload.batchId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error cancelling batch scrape:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Handle BATCH_SCRAPE_RETRY_URL message from UI
 */
const handleBatchScrapeRetryUrl: MessageHandler = async (message, sender, sendResponse) => {
  log.debug('UI requested to retry URL')
  try {
    const payload = message.payload as BatchScrapeRetryPayload
    await retryUrl(payload.batchId, payload.urlResultId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('Error retrying URL:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * UI message handler registry
 */
const uiHandlers: Record<string, MessageHandler> = {
  [MESSAGE_TYPES.EXPORT_TO_SHEETS]: handleExportFromUi,
  [MESSAGE_TYPES.OPEN_SIDEPANEL]: handleOpenSidepanel,
  [MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE]: handleDemoScrapeMessage,
  [MESSAGE_TYPES.OPEN_BATCH_SCRAPE]: handleOpenBatchScrape,
  [MESSAGE_TYPES.OPEN_BATCH_SCRAPE_HISTORY]: handleOpenBatchScrapeHistory,
  [MESSAGE_TYPES.BATCH_SCRAPE_START]: handleBatchScrapeStart,
  [MESSAGE_TYPES.BATCH_SCRAPE_PAUSE]: handleBatchScrapePause,
  [MESSAGE_TYPES.BATCH_SCRAPE_RESUME]: handleBatchScrapeResume,
  [MESSAGE_TYPES.BATCH_SCRAPE_CANCEL]: handleBatchScrapeCancel,
  [MESSAGE_TYPES.BATCH_SCRAPE_RETRY_URL]: handleBatchScrapeRetryUrl,
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
    sendResponse({ success: false, warning: 'Unhandled message type' })
  }
}
