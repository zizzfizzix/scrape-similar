import { highlightMatchingElements } from '@/entrypoints/content/highlight'
import type { ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { evaluateXPath, guessScrapeConfigForElement, scrapePage } from '@/utils/scraper'
import { MESSAGE_TYPES, type Message, type ScrapeConfig, type ScrapeResult } from '@/utils/types'
import log from 'loglevel'

interface HandlerDependencies {
  enablePickerMode: () => Promise<void>
  disablePickerMode: () => void
}

/**
 * Create message handler function
 */
export const createMessageHandler = (state: ContentScriptState, deps: HandlerDependencies) => {
  return (
    message: Message,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response: any) => void,
  ): boolean | void => {
    log.debug('Content script received message:', message)

    try {
      switch (message.type) {
        case MESSAGE_TYPES.START_SCRAPE: {
          return handleStartScrape(message, state, sendResponse)
        }

        case MESSAGE_TYPES.HIGHLIGHT_ELEMENTS: {
          return handleHighlightElements(message, sendResponse)
        }

        case MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT: {
          return handleHighlightRowElement(message, sendResponse)
        }

        case MESSAGE_TYPES.ENABLE_PICKER_MODE: {
          log.debug('Enabling picker mode via message')
          deps.enablePickerMode()
          sendResponse({ success: true, message: 'Picker mode enabled' })
          break
        }

        case MESSAGE_TYPES.DISABLE_PICKER_MODE: {
          log.debug('Disabling picker mode via message')
          deps.disablePickerMode()
          sendResponse({ success: true, message: 'Picker mode disabled' })
          break
        }

        case MESSAGE_TYPES.TOGGLE_PICKER_MODE: {
          log.debug('Toggling picker mode via message')
          if (state.pickerModeActive) {
            deps.disablePickerMode()
            sendResponse({ success: true, message: 'Picker mode disabled' })
          } else {
            deps.enablePickerMode()
            sendResponse({ success: true, message: 'Picker mode enabled' })
          }
          break
        }

        case MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE: {
          return handleSaveElementDetails(message, state, sendResponse)
        }

        case MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR: {
          return handleGuessConfigFromSelector(message, state, sendResponse)
        }
      }
    } catch (error) {
      log.error('Error in content script:', error)
    }
  }
}

/**
 * Handle START_SCRAPE message
 */
const handleStartScrape = (
  message: Message,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): boolean => {
  log.debug('Starting scrape with config (direct from UI):', message.payload)
  const config = message.payload as ScrapeConfig
  const scrapedData = scrapePage(config)
  const columnOrder = config.columns.map((col) => col.name)
  const scrapeResult: ScrapeResult = {
    data: scrapedData,
    columnOrder,
  }

  log.debug('Scrape complete, data:', scrapeResult)

  // Track scraping completion
  trackEvent(ANALYTICS_EVENTS.SCRAPE_COMPLETION, {
    items_scraped: scrapedData.length,
    columns_count: config.columns.length,
  })

  if (state.tabId === null) {
    const errMsg = 'tabId not initialized in content script.'
    log.error(errMsg)
    sendResponse({ success: false, error: errMsg })
    return true
  }

  // Send scrape result to background script for storage
  browser.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: { tabId: state.tabId, updates: { scrapeResult } },
    },
    (response) => {
      if (browser.runtime.lastError) {
        log.error('Error sending scrape result to background:', browser.runtime.lastError)
        sendResponse({
          success: false,
          error: 'Failed to save data to storage: ' + browser.runtime.lastError.message,
        })
      } else if (response?.success) {
        sendResponse({
          success: true,
          data: scrapeResult,
          message: `Scraped ${scrapeResult.data.length} items successfully and stored in session.`,
        })
      } else {
        sendResponse({
          success: false,
          error: response?.error || 'Failed to save data to storage',
        })
      }
    },
  )
  return true
}

/**
 * Handle HIGHLIGHT_ELEMENTS message
 */
const handleHighlightElements = (message: Message, sendResponse: (response: any) => void): void => {
  log.debug('Highlighting elements:', message.payload)
  const { selector, shouldScroll } = (message.payload || {}) as {
    selector: string
    shouldScroll?: boolean
  }
  let elements: any[] = []
  try {
    elements = evaluateXPath(selector)
  } catch (err) {
    let errorMsg = 'Evaluation failed'
    if (
      err instanceof DOMException &&
      err.name === 'SyntaxError' &&
      typeof err.message === 'string' &&
      err.message.includes("Failed to execute 'evaluate' on 'Document'")
    ) {
      errorMsg = 'Invalid XPath'
    } else if (err instanceof Error) {
      errorMsg = err.message
    } else if (typeof err === 'string') {
      errorMsg = err
    }
    sendResponse({
      success: false,
      error: errorMsg,
    })
    return
  }
  highlightMatchingElements(elements, { shouldScroll })

  // Track element highlighting
  trackEvent(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
    elements_count: elements.length,
    is_row_highlight: false,
  })

  // Respond directly to the UI that sent this message, include match count
  sendResponse({
    success: true,
    message: 'Elements highlighted successfully.',
    matchCount: elements.length,
  })
}

/**
 * Handle HIGHLIGHT_ROW_ELEMENT message
 */
const handleHighlightRowElement = (
  message: Message,
  sendResponse: (response: any) => void,
): void => {
  log.debug('Highlighting row element:', message.payload)
  const { selector } = message.payload as { selector: string }
  let elements: any[] = []
  try {
    elements = evaluateXPath(selector)
  } catch (err) {
    let errorMsg = 'Evaluation failed'
    if (
      err instanceof DOMException &&
      err.name === 'SyntaxError' &&
      typeof err.message === 'string' &&
      err.message.includes("Failed to execute 'evaluate' on 'Document'")
    ) {
      errorMsg = 'Invalid XPath'
    } else if (err instanceof Error) {
      errorMsg = err.message
    } else if (typeof err === 'string') {
      errorMsg = err
    }
    sendResponse({
      success: false,
      error: errorMsg,
    })
    return
  }
  highlightMatchingElements(elements)

  // Track row element highlighting
  trackEvent(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
    elements_count: elements.length,
    is_row_highlight: true,
  })

  // Respond directly to the UI that sent this message
  sendResponse({
    success: true,
    message: 'Row element highlighted successfully.',
  })
}

/**
 * Handle SAVE_ELEMENT_DETAILS_TO_STORAGE message
 */
const handleSaveElementDetails = (
  message: Message,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): boolean => {
  if (!state.lastRightClickedElementDetails || !state.lastRightClickedElement) {
    log.warn('No lastRightClickedElementDetails or element to save.')
    sendResponse({ success: false, error: 'No element details in memory.' })
    return true
  }
  if (state.tabId === null) {
    const errMsg = 'tabId not initialized in content script.'
    log.error(errMsg)
    sendResponse({ success: false, error: errMsg })
    return true
  }
  try {
    const guessedConfig = guessScrapeConfigForElement(state.lastRightClickedElement)
    const details = state.lastRightClickedElementDetails
    browser.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: {
          tabId: state.tabId,
          updates: { currentScrapeConfig: guessedConfig, elementDetails: details },
        },
      },
      (response) => {
        if (browser.runtime.lastError) {
          log.error('Error sending element config to background:', browser.runtime.lastError)
          sendResponse({ success: false, error: browser.runtime.lastError.message })
        } else if (response?.success) {
          sendResponse({ success: true })
        } else {
          sendResponse({
            success: false,
            error: response?.error || 'Failed to save config',
          })
        }
      },
    )
  } catch (err) {
    log.error('Error guessing or saving ScrapeConfig:', err)
    sendResponse({ success: false, error: (err as Error).message })
  }
  return true
}

/**
 * Handle GUESS_CONFIG_FROM_SELECTOR message
 */
const handleGuessConfigFromSelector = (
  message: Message,
  state: ContentScriptState,
  sendResponse: (response: any) => void,
): boolean => {
  const { mainSelector } = message.payload || {}
  if (!mainSelector?.trim()) {
    sendResponse({ success: false, error: 'Missing mainSelector' })
    return true
  }
  if (state.tabId === null) {
    const errMsg = 'tabId not initialized in content script.'
    log.error(errMsg)
    sendResponse({ success: false, error: errMsg })
    return true
  }
  const elements = evaluateXPath(mainSelector)
  if (elements.length === 0) {
    sendResponse({ success: false, error: 'No elements found for selector' })
    return true
  }
  const guessed = guessScrapeConfigForElement(elements[0])
  const updatedConfig = {
    ...guessed,
    mainSelector,
  }
  browser.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: { tabId: state.tabId, updates: { currentScrapeConfig: updatedConfig } },
    },
    (response) => {
      if (browser.runtime.lastError) {
        log.error('Error sending guessed config to background:', browser.runtime.lastError)
        sendResponse({ success: false, error: browser.runtime.lastError.message })
      } else if (response?.success) {
        sendResponse({ success: true })
      } else {
        sendResponse({
          success: false,
          error: response?.error || 'Failed to save config',
        })
      }
    },
  )
  return true
}
