import {
  evaluateXPath,
  guessScrapeConfigForElement,
  minimizeXPath,
  scrapePage,
} from '../core/scraper'
import { MESSAGE_TYPES, Message, ScrapeConfig } from '../core/types'

console.info('Scrape Similar content script is running')

// Track the currently highlighted elements
let highlightedElements: HTMLElement[] = []
let highlightRemovalTimeout: ReturnType<typeof setTimeout> | null = null
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
    console.error(
      'Failed to get tabId on content script initialization:',
      chrome.runtime.lastError?.message || response,
    )
    throw new Error('Content script cannot function without tabId.')
  }
  tabId = response.tabId
  console.log('Content script initialized with tabId:', tabId)
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
  console.log('Context menu event captured', event.target)
  rightClickListener(event as MouseEvent)
})

console.log('CONTENT SCRIPT ADDING MESSAGE LISTENER')
// Handle messages from background script
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('Content script received message:', message)

  try {
    switch (message.type) {
      case MESSAGE_TYPES.START_SCRAPE: {
        console.log('Starting scrape with config (direct from UI):', message.payload)
        const config = message.payload as ScrapeConfig
        const data = scrapePage(config)
        const columnOrder = config.columns.map((col) => col.name)
        const scrapedDataResult = { data, columnOrder }

        console.log('Scrape complete, data:', scrapedDataResult)

        // Use cached tabId
        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.'
          console.error(errMsg)
          sendResponse({ success: false, error: errMsg })
          return
        }
        const sessionKey = `sidepanel_config_${tabId}`

        // Try to access session storage directly
        chrome.storage.session.get(sessionKey, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Error accessing session storage:', chrome.runtime.lastError)
            sendResponse({
              success: false,
              error:
                'Cannot access storage from content script: ' + chrome.runtime.lastError.message,
            })
            return
          }

          try {
            const currentData = result[sessionKey] || {}

            // Update with new scraped data
            const updatedData = {
              ...currentData,
              scrapedData: scrapedDataResult,
            }

            // Save directly to storage
            console.log(
              `Content script directly saving scraped data to session storage for tab ${tabId}:`,
              data.length,
              'items',
            )
            chrome.storage.session.set({ [sessionKey]: updatedData }, () => {
              if (chrome.runtime.lastError) {
                console.error('Error saving to session storage:', chrome.runtime.lastError)
                sendResponse({
                  success: false,
                  error: 'Failed to save data to storage: ' + chrome.runtime.lastError.message,
                })
              } else {
                sendResponse({
                  success: true,
                  data: scrapedDataResult,
                  message: `Scraped ${data.length} items successfully and stored in session.`,
                })
              }
            })
          } catch (error) {
            console.error('Error updating session storage:', error)
            sendResponse({
              success: false,
              error: 'Error updating session storage: ' + (error as Error).message,
            })
          }
        })

        // Signal that we'll respond asynchronously
        return true
      }

      case MESSAGE_TYPES.HIGHLIGHT_ELEMENTS: {
        console.log('Highlighting elements:', message.payload)
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

        // Respond directly to the UI that sent this message, include match count
        sendResponse({
          success: true,
          message: 'Elements highlighted successfully.',
          matchCount: elements.length,
        })
        break
      }
      // Add a default case for unhandled messages
      default: {
        console.log('Unhandled message type in content script:', message.type)
        // Optionally send a response indicating not handled, or do nothing
        // sendResponse({ received: false, error: `Unhandled message type: ${message.type}` });
        // No return true here, as it's synchronous handling (or no handling)
        break
      }

      // Handle request to save last right-clicked element details to storage
      case MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE: {
        if (!lastRightClickedElementDetails || !lastRightClickedElement) {
          console.warn('No lastRightClickedElementDetails or element to save.')
          sendResponse({ success: false, error: 'No element details in memory.' })
          break
        }
        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.'
          console.error(errMsg)
          sendResponse({ success: false, error: errMsg })
          break
        }
        // Guess and save ScrapeConfig to session storage only when context menu is used
        try {
          const guessedConfig = guessScrapeConfigForElement(lastRightClickedElement)
          const details = lastRightClickedElementDetails
          const sessionKey = `sidepanel_config_${tabId}`
          chrome.storage.session.get(sessionKey, (result) => {
            const existingData = result[sessionKey] || {}
            const updatedData = {
              ...existingData,
              currentScrapeConfig: guessedConfig,
              elementDetails: details,
            }
            chrome.storage.session.set({ [sessionKey]: updatedData }, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  'Error saving guessed ScrapeConfig to storage:',
                  chrome.runtime.lastError,
                )
                sendResponse({ success: false, error: chrome.runtime.lastError.message })
              } else {
                sendResponse({ success: true })
              }
            })
          })
        } catch (err) {
          console.error('Error guessing or saving ScrapeConfig:', err)
          sendResponse({ success: false, error: (err as Error).message })
        }
        return true
      }

      case MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR: {
        // Guess config from selector and update storage
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
        const sessionKey = `sidepanel_config_${tabId}`
        chrome.storage.session.get(sessionKey, (result) => {
          const existingData = result[sessionKey] || {}
          const updatedData = {
            ...existingData,
            currentScrapeConfig: updatedConfig,
          }
          chrome.storage.session.set({ [sessionKey]: updatedData }, () => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message })
            } else {
              sendResponse({ success: true })
            }
          })
        })
        return true
      }
    }
  } catch (error) {
    console.error('Error in content script:', error)
  }
})
console.log('CONTENT SCRIPT MESSAGE LISTENER ADDED')

// Highlight matching elements in the page
const highlightMatchingElements = (elements: any[]) => {
  // Remove previous highlights
  removeHighlights()

  // Apply highlights
  elements.forEach((element) => {
    // Save reference to highlight removal
    highlightedElements.push(element as HTMLElement)

    // Add highlight class
    element.classList.add('scrape-similar-highlight')

    // Create and insert highlight style if it doesn't exist
    if (!document.getElementById('scrape-similar-highlight-style')) {
      const style = document.createElement('style')
      style.id = 'scrape-similar-highlight-style'
      style.textContent = `
        .scrape-similar-highlight {
          outline: 2px solid #5c8df6 !important;
          outline-offset: 2px !important;
          background-color: rgba(92, 141, 246, 0.2) !important;
        }
      `
      document.head.appendChild(style)
    }
  })

  // Scroll first element into view if available
  if (elements.length > 0) {
    elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Automatically remove highlights after 3 seconds
  if (highlightRemovalTimeout) {
    clearTimeout(highlightRemovalTimeout)
  }
  highlightRemovalTimeout = setTimeout(() => {
    removeHighlights()
    highlightRemovalTimeout = null
  }, 3000)
}

// Remove all highlights
const removeHighlights = () => {
  highlightedElements.forEach((element) => {
    element.classList.remove('scrape-similar-highlight')
  })

  highlightedElements = []
}
