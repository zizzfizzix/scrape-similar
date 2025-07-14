import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'
import {
  evaluateXPath,
  guessScrapeConfigForElement,
  minimizeXPath,
  scrapePage,
} from '@/core/scraper'
import { MESSAGE_TYPES, Message, ScrapeConfig, ScrapeResult } from '@/core/types'
import log from 'loglevel'
log.setDefaultLevel('error')

// On startup, set log level from storage
chrome.storage.sync.get(['debugMode'], (result) => {
  log.setLevel(result.debugMode ? 'trace' : 'error')
})

// Listen for debugMode changes in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.debugMode) {
    log.setLevel(changes.debugMode.newValue ? 'trace' : 'error')
  }
})

log.info('Scrape Similar content script is running')

// Store the tabId for this content script instance
let tabId: number | null = null
// Store the last right-clicked element
let lastRightClickedElement: HTMLElement | null = null
// Store the last right-clicked element details (XPath, selector)
interface ElementDetails {
  xpath: string
  text: string
  html: string
}
let lastRightClickedElementDetails: ElementDetails | null = null

// Request tabId on initialization and throw if not available
chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, (response) => {
  if (chrome.runtime.lastError || !response || typeof response.tabId !== 'number') {
    log.error(
      'Failed to get tabId on content script initialization:',
      chrome.runtime.lastError?.message || response,
    )
    throw new Error('Content script cannot function without tabId.')
  }
  tabId = response.tabId
  log.debug('Content script initialized with tabId:', tabId)
})

// Handle right-click for later element selection
const rightClickListener = (event: MouseEvent) => {
  lastRightClickedElement = event.target as HTMLElement
  if (lastRightClickedElement) {
    const selector = minimizeXPath(lastRightClickedElement)
    lastRightClickedElementDetails = {
      xpath: selector,
      text: lastRightClickedElement.textContent || '',
      html: lastRightClickedElement.outerHTML,
    }
  }
}

// Listen for context menu events to capture target element
document.addEventListener('contextmenu', (event) => {
  log.debug('Context menu event captured', event.target)
  rightClickListener(event as MouseEvent)
})

log.debug('CONTENT SCRIPT ADDING MESSAGE LISTENER')
// Handle messages from background script
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  log.debug('Content script received message:', message)

  try {
    switch (message.type) {
      case MESSAGE_TYPES.START_SCRAPE: {
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

        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.'
          log.error(errMsg)
          sendResponse({ success: false, error: errMsg })
          return
        }

        // Send scrape result to background script for storage
        chrome.runtime.sendMessage(
          {
            type: MESSAGE_TYPES.SAVE_SCRAPE_RESULT_TO_STORAGE,
            payload: { scrapeResult },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log.error('Error sending scrape result to background:', chrome.runtime.lastError)
              sendResponse({
                success: false,
                error: 'Failed to save data to storage: ' + chrome.runtime.lastError.message,
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

      case MESSAGE_TYPES.HIGHLIGHT_ELEMENTS: {
        log.debug('Highlighting elements:', message.payload)
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
          break
        }
        highlightMatchingElements(elements)

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
        break
      }

      case MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT: {
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
          break
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
        break
      }

      // Add a default case for unhandled messages
      default: {
        log.debug('Unhandled message type in content script:', message.type)
        // Optionally send a response indicating not handled, or do nothing
        // sendResponse({ received: false, error: `Unhandled message type: ${message.type}` });
        // No return true here, as it's synchronous handling (or no handling)
        break
      }

      // Handle request to save last right-clicked element details to storage
      case MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE: {
        if (!lastRightClickedElementDetails || !lastRightClickedElement) {
          log.warn('No lastRightClickedElementDetails or element to save.')
          sendResponse({ success: false, error: 'No element details in memory.' })
          break
        }
        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.'
          log.error(errMsg)
          sendResponse({ success: false, error: errMsg })
          break
        }
        try {
          const guessedConfig = guessScrapeConfigForElement(lastRightClickedElement)
          const details = lastRightClickedElementDetails
          chrome.runtime.sendMessage(
            {
              type: MESSAGE_TYPES.SAVE_ELEMENT_CONFIG_TO_STORAGE,
              payload: { config: guessedConfig, elementDetails: details },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                log.error('Error sending element config to background:', chrome.runtime.lastError)
                sendResponse({ success: false, error: chrome.runtime.lastError.message })
              } else if (response?.success) {
                sendResponse({ success: true })
              } else {
                sendResponse({ success: false, error: response?.error || 'Failed to save config' })
              }
            },
          )
        } catch (err) {
          log.error('Error guessing or saving ScrapeConfig:', err)
          sendResponse({ success: false, error: (err as Error).message })
        }
        return true
      }

      case MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR: {
        const { mainSelector } = message.payload || {}
        if (!mainSelector.trim()) {
          sendResponse({ success: false, error: 'Missing mainSelector' })
          break
        }
        const elements = evaluateXPath(mainSelector)
        if (elements.length === 0) {
          sendResponse({ success: false, error: 'No elements found for selector' })
          break
        }
        const guessed = guessScrapeConfigForElement(elements[0])
        const updatedConfig = {
          ...guessed,
          mainSelector,
        }
        chrome.runtime.sendMessage(
          {
            type: MESSAGE_TYPES.SAVE_GUESSED_CONFIG_TO_STORAGE,
            payload: { config: updatedConfig },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log.error('Error sending guessed config to background:', chrome.runtime.lastError)
              sendResponse({ success: false, error: chrome.runtime.lastError.message })
            } else if (response?.success) {
              sendResponse({ success: true })
            } else {
              sendResponse({ success: false, error: response?.error || 'Failed to save config' })
            }
          },
        )
        return true
      }
    }
  } catch (error) {
    log.error('Error in content script:', error)
  }
})
log.debug('CONTENT SCRIPT MESSAGE LISTENER ADDED')

function isVisibleAndInViewport(element: Element): boolean {
  if (!element.checkVisibility()) return false

  const rect = element.getBoundingClientRect()
  if (
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > window.innerHeight ||
    rect.left > window.innerWidth
  ) {
    return false
  }
  return true
}

// Highlight matching elements in the page using Web Animations API
const highlightMatchingElements = (elements: Element[]) => {
  // Scroll first element into view if available
  if (elements.length > 0 && !isVisibleAndInViewport(elements[0])) {
    elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  elements.forEach((element) => {
    element.animate(
      [
        {
          outline: '0px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0,
        },
        {
          outline: '5px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1.2)',
          offset: 0.1,
        },
        {
          outline: '4px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.25,
        },
        {
          outline: '3px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.5,
        },
        {
          outline: '2px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.75,
        },
        {
          outline: '1px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 1,
        },
      ],
      {
        duration: 3000,
        iterations: 1,
        easing: 'ease-out',
      },
    )
  })
}
