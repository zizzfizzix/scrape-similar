console.log('CONTENT SCRIPT TOP LEVEL EXECUTION START')

import { MESSAGE_TYPES, Message, ScrapeConfig, ElementDetailsPayload } from '../core/types'
import { findElements, getSelectorSuggestions, scrapePage } from '../core/scraper'

console.info('Modern Scraper content script is running')

// Notify background script that content script has loaded
function notifyBackgroundScriptLoaded() {
  console.log('Notifying background script that content script is ready')
  chrome.runtime.sendMessage(
    {
      type: 'CONTENT_SCRIPT_LOADED',
      payload: { location: window.location.href },
    },
    (response) => {
      console.log('Background script responded to load notification:', response)
    },
  )
}

// Execute this when content script loads
notifyBackgroundScriptLoaded()

// Track the currently highlighted elements
let highlightedElements: HTMLElement[] = []
// Store the tabId for this content script instance
let tabId: number | null = null
// Store the last right-clicked element
let lastRightClickedElement: HTMLElement | null = null
// Store the last right-clicked element details (XPath, selector)
interface ElementDetails {
  xpath: string
  css: string
  text: string
  html: string
}
let lastRightClickedElementDetails: ElementDetails | null = null

// Request tabId on initialization and throw if not available
chrome.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, (response) => {
  if (chrome.runtime.lastError || !response || typeof response.tabId !== 'number') {
    console.error('Failed to get tabId on content script initialization:', chrome.runtime.lastError?.message || response)
    throw new Error('Content script cannot function without tabId.');
  }
  tabId = response.tabId;
  console.log('Content script initialized with tabId:', tabId);
})

// Handle right-click for later element selection
const rightClickListener = (event: MouseEvent) => {
  lastRightClickedElement = event.target as HTMLElement
  if (lastRightClickedElement) {
    const selectors = getSelectorSuggestions(lastRightClickedElement)
    lastRightClickedElementDetails = {
      xpath: selectors.xpath,
      css: selectors.css,
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
      case MESSAGE_TYPES.CONTEXT_MENU_ACTION_TRIGGERED: {
        console.log('Context menu action triggered, sending cached details back.')
        if (lastRightClickedElementDetails) {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ELEMENT_DETAILS_READY,
            payload: lastRightClickedElementDetails,
          })
          console.log('Sent element details:', lastRightClickedElementDetails)
        } else {
          console.warn('No cached element details found to send.')
          // Optionally send a message indicating no details were found
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ELEMENT_DETAILS_READY,
            payload: null, // Explicitly send null
          })
        }
        sendResponse({ received: true })
        break
      }

      // Handle request from Background script for cached details from last right-click
      case MESSAGE_TYPES.REQUEST_CACHED_ELEMENT_DETAILS: {
        console.log('Background script requested cached element details...');
        if (lastRightClickedElementDetails) {
          const payload: ElementDetailsPayload = {
            xpath: lastRightClickedElementDetails.xpath,
            css: lastRightClickedElementDetails.css,
            text: lastRightClickedElementDetails.text
          };
          console.log('Sending cached details to background:', payload);
          sendResponse({ success: true, payload: payload });
        } else {
          console.warn('No cached element details available for background request.');
          sendResponse({ success: false, payload: null, error: 'No cached element details.' });
        }
        // Required: Signal async response
        return true;
      }

      case MESSAGE_TYPES.START_SCRAPE: {
        console.log('Starting scrape with config (direct from UI):', message.payload)
        const config = message.payload as ScrapeConfig
        const data = scrapePage(config)

        console.log('Scrape complete, data:', data)
        
        // Use cached tabId
        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.';
          console.error(errMsg);
          sendResponse({ success: false, error: errMsg });
          return;
        }
        const sessionKey = `sidepanel_config_${tabId}`;
        
        // Try to access session storage directly
        chrome.storage.session.get(sessionKey, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Error accessing session storage:', chrome.runtime.lastError);
            sendResponse({
              success: false,
              error: 'Cannot access storage from content script: ' + chrome.runtime.lastError.message
            });
            return;
          }
          
          try {
            const currentData = result[sessionKey] || {};
            
            // Update with new scraped data
            const updatedData = {
              ...currentData,
              scrapedData: data
            };
            
            // Save directly to storage
            console.log(`Content script directly saving scraped data to session storage for tab ${tabId}:`, data.length, 'items');
            chrome.storage.session.set({ [sessionKey]: updatedData }, () => {
              if (chrome.runtime.lastError) {
                console.error('Error saving to session storage:', chrome.runtime.lastError);
                sendResponse({
                  success: false,
                  error: 'Failed to save data to storage: ' + chrome.runtime.lastError.message
                });
              } else {
                sendResponse({ 
                  success: true, 
                  message: `Scraped ${data.length} items successfully and stored in session.` 
                });
              }
            });
          } catch (error) {
            console.error('Error updating session storage:', error);
            sendResponse({
              success: false,
              error: 'Error updating session storage: ' + (error as Error).message
            });
          }
        });
        
        // Signal that we'll respond asynchronously
        return true;
      }

      case MESSAGE_TYPES.HIGHLIGHT_ELEMENTS: {
        console.log('Highlighting elements:', message.payload)
        const { selector, language } = message.payload as { selector: string; language: string }
        highlightMatchingElements(selector, language)

        // Respond directly to the UI that sent this message
        sendResponse({ 
          success: true, 
          message: 'Elements highlighted successfully.' 
        })
        break
      }
      // Add a default case for unhandled messages
      default: {
        console.log('Unhandled message type in content script:', message.type);
        // Optionally send a response indicating not handled, or do nothing
        // sendResponse({ received: false, error: `Unhandled message type: ${message.type}` });
        // No return true here, as it's synchronous handling (or no handling)
        break;
      }

      // Handle request to save last right-clicked element details to storage
      case 'SAVE_ELEMENT_DETAILS_TO_STORAGE': {
        if (!lastRightClickedElementDetails) {
          console.warn('No lastRightClickedElementDetails to save.');
          sendResponse({ success: false, error: 'No element details in memory.' });
          break;
        }
        if (tabId === null) {
          const errMsg = 'tabId not initialized in content script.';
          console.error(errMsg);
          sendResponse({ success: false, error: errMsg });
          break;
        }
        // At this point, lastRightClickedElementDetails is not null due to the guard above
        const details = lastRightClickedElementDetails!;
        const sessionKey = `sidepanel_config_${tabId}`;
        chrome.storage.session.get(sessionKey, (result) => {
          const existingData = result[sessionKey] || {};
          const existingConfig = existingData.currentScrapeConfig || {};
          const updatedConfig = {
            ...existingConfig,
            mainSelector: details.xpath,
            language: 'xpath',
          };
          const updatedData = {
            ...existingData,
            currentScrapeConfig: updatedConfig,
            elementDetails: details,
          };
          chrome.storage.session.set({ [sessionKey]: updatedData }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving element details to storage:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ success: true });
            }
          });
        });
        return true;
      }
    }
  } catch (error) {
    console.error('Error in content script:', error)
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CONTENT_SCRIPT_ERROR,
      payload: (error as Error).message,
    })
  }
})
console.log('CONTENT SCRIPT MESSAGE LISTENER ADDED')

// Get selection options based on right-clicked element or text selection
const getSelectionOptions = (selectionText?: string) => {
  // First try to use the stored element details from session storage
  try {
    const storedDetails = sessionStorage.getItem('lastRightClickedElement')
    if (storedDetails) {
      const details = JSON.parse(storedDetails)
      console.log('Retrieved stored element details:', details)

      // If we have valid stored selector details, use them
      if (details && details.xpath) {
        console.log('Using stored XPath selector:', details.xpath)

        // Generate preview data for these selectors
        const elements = findElements(details.xpath, 'xpath')
        const previewData = extractPreviewData(elements.slice(0, 3).map((el) => el as HTMLElement))

        // Try a quick scrape with a basic configuration
        const quickScrapeConfig = {
          mainSelector: details.xpath,
          language: 'xpath' as const,
          columns: [{ name: 'Text', selector: '.', language: 'xpath' as const }],
        }

        const quickScrapeResult = scrapePage(quickScrapeConfig)

        return {
          selectors: {
            xpath: details.xpath,
            css: details.css,
          },
          selectedText: selectionText || details.text,
          previewData,
          quickScrapeResult,
        }
      }
    }
  } catch (e) {
    console.error('Error retrieving stored element details:', e)
  }

  // If no stored details, proceed with the original approach
  // Try to use the last right-clicked element first
  let targetElement = lastRightClickedElement
  console.log('Getting selection options for element:', targetElement)

  // If no right-clicked element or text selection available, try to use current selection
  if (!targetElement || selectionText) {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      // Use the common ancestor of the selection if it's an element node
      const commonAncestor = range.commonAncestorContainer
      console.log('Using selected text common ancestor:', commonAncestor)

      if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
        targetElement = commonAncestor as HTMLElement
      } else if (commonAncestor.parentElement) {
        // Use parent element if text node
        targetElement = commonAncestor.parentElement as HTMLElement
      }
    }
  }

  // If still no target element, use body (fallback)
  if (!targetElement) {
    console.log('No target element found, using document.body')
    targetElement = document.body as HTMLElement
  }

  // Get selector suggestions for the target element
  const selectorSuggestions = getSelectorSuggestions(targetElement)
  console.log('Generated selector suggestions:', selectorSuggestions)

  // Generate preview data for these selectors
  const previewData = generatePreviewData(targetElement, selectorSuggestions)
  console.log('Generated preview data:', previewData)

  // Try a quick scrape with a basic configuration to demonstrate
  const quickScrapeConfig = {
    mainSelector: selectorSuggestions.xpath,
    language: 'xpath' as const,
    columns: [{ name: 'Text', selector: '.', language: 'xpath' as const }],
  }

  const quickScrapeResult = scrapePage(quickScrapeConfig)
  console.log('Quick scrape result:', quickScrapeResult)

  return {
    selectors: selectorSuggestions,
    selectedText: selectionText,
    previewData,
    quickScrapeResult,
  }
}

// Generate preview data for the suggested selectors
const generatePreviewData = (element: HTMLElement, selectors: { xpath: string; css: string }) => {
  // Try to find similar elements using XPath selector
  const xpathElements = findElements(selectors.xpath, 'xpath')
  if (xpathElements.length > 1) {
    // Found multiple elements with XPath, good for preview
    return extractPreviewData(xpathElements.slice(0, 3).map((el) => el as HTMLElement))
  }

  // Try CSS selector if XPath didn't find multiple elements
  const cssElements = findElements(selectors.css, 'css')
  if (cssElements.length > 1) {
    return extractPreviewData(cssElements.slice(0, 3).map((el) => el as HTMLElement))
  }

  // If no good selectors, just return the current element
  return extractPreviewData([element])
}

// Extract preview data from elements
const extractPreviewData = (elements: HTMLElement[]) => {
  return elements.map((element) => {
    // Extract basic information from the element
    return {
      text: element.textContent?.trim() || '',
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      href: element instanceof HTMLAnchorElement ? element.href : '',
    }
  })
}

// Highlight matching elements in the page
const highlightMatchingElements = (selector: string, language: string) => {
  // Remove previous highlights
  removeHighlights()

  // Find elements matching the selector
  const elements = findElements(selector, language === 'xpath' ? 'xpath' : 'css')

  // Apply highlights
  elements.forEach((element) => {
    // Save reference to highlight removal
    highlightedElements.push(element as HTMLElement)

    // Add highlight class
    element.classList.add('modern-scraper-highlight')

    // Create and insert highlight style if it doesn't exist
    if (!document.getElementById('modern-scraper-highlight-style')) {
      const style = document.createElement('style')
      style.id = 'modern-scraper-highlight-style'
      style.textContent = `
        .modern-scraper-highlight {
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
}

// Remove all highlights
const removeHighlights = () => {
  highlightedElements.forEach((element) => {
    element.classList.remove('modern-scraper-highlight')
  })

  highlightedElements = []
}
