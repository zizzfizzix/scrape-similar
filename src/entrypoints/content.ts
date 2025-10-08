import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'

log.setDefaultLevel('error')

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    // Always log at trace level in development or test mode
    if (isDevOrTest) {
      log.setLevel('trace')
    } else {
      // Request current debug mode from the background script since content scripts
      // do not have direct access to extension storage APIs.
      browser.runtime.sendMessage(
        { type: MESSAGE_TYPES.GET_DEBUG_MODE },
        (response: MessageResponse) => {
          if (response.success === true && typeof response.debugMode === 'boolean') {
            log.setLevel(response.debugMode ? 'trace' : 'error')
          }
        },
      )

      // Listen for debug mode changes broadcast from the background script
      browser.runtime.onMessage.addListener((msg: Message) => {
        if (msg.type === MESSAGE_TYPES.DEBUG_MODE_CHANGED) {
          const { debugMode } = (msg.payload as { debugMode: boolean }) || { debugMode: false }
          log.setLevel(debugMode ? 'trace' : 'error')
        }
      })
    }

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
    browser.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, (response: MessageResponse) => {
      if (response.success === false || typeof response.tabId !== 'number') {
        log.error(
          'Failed to get tabId on content script initialization:',
          browser.runtime.lastError?.message || response,
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

    // ========== PICKER MODE STATE AND FUNCTIONS ==========
    let pickerModeActive = false
    let pickerCursor: HTMLDivElement | null = null
    let pickerHighlights: HTMLDivElement[] = []
    let currentHoveredElement: HTMLElement | null = null
    let currentXPath = ''
    // Animation frame throttling for mouse move
    let mouseUpdateScheduled = false
    let lastMouseX = 0
    let lastMouseY = 0

    // Inject styles for picker overlays (only once)
    const injectPickerStyles = () => {
      if (document.getElementById('scrape-similar-picker-styles')) return

      const style = document.createElement('style')
      style.id = 'scrape-similar-picker-styles'
      style.textContent = `
        .scrape-similar-picker-highlight {
          position: absolute;
          pointer-events: none;
          border: 2px solid #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
          box-sizing: border-box;
          z-index: 2147483646;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        .scrape-similar-picker-label {
          position: absolute;
          top: -26px;
          left: -2px;
          background: #ff6b6b;
          color: white;
          padding: 2px 8px;
          font-size: 11px;
          font-family: monospace;
          border-radius: 3px;
          white-space: nowrap;
          max-width: 400px;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          z-index: 2147483647;
        }
        .scrape-similar-picker-cursor {
          position: fixed;
          width: 20px;
          height: 20px;
          pointer-events: none;
          z-index: 2147483647;
        }
        .scrape-similar-picker-cursor::before,
        .scrape-similar-picker-cursor::after {
          content: '';
          position: absolute;
          background: #ff6b6b;
        }
        .scrape-similar-picker-cursor::before {
          width: 2px;
          height: 20px;
          left: 9px;
          top: 0;
        }
        .scrape-similar-picker-cursor::after {
          width: 20px;
          height: 2px;
          left: 0;
          top: 9px;
        }
      `
      document.head.appendChild(style)
    }

    const createPickerCursor = () => {
      const cursor = document.createElement('div')
      cursor.className = 'scrape-similar-picker-cursor'
      document.body.appendChild(cursor)
      return cursor
    }

    const removePickerHighlights = () => {
      pickerHighlights.forEach((h) => h.remove())
      pickerHighlights = []
    }

    const highlightElementsForPicker = (elements: HTMLElement[], xpath: string) => {
      removePickerHighlights()

      elements.forEach((el, index) => {
        // Create highlight as sibling wrapper
        const highlight = document.createElement('div')
        highlight.className = 'scrape-similar-picker-highlight'

        // Get element's position for absolute positioning
        const rect = el.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(el)
        const position = computedStyle.position

        // Save original position if needed
        const originalPosition = el.style.position
        const originalZIndex = el.style.zIndex

        // Make element positioned if it's not already
        if (position === 'static') {
          el.style.position = 'relative'
        }

        // Store original values for cleanup
        highlight.setAttribute('data-original-position', originalPosition)
        highlight.setAttribute('data-original-zindex', originalZIndex)

        // Insert highlight as first child of element
        el.appendChild(highlight)

        // Add label to first element
        if (index === 0) {
          const label = document.createElement('div')
          label.className = 'scrape-similar-picker-label'
          label.textContent = `${elements.length} match${elements.length !== 1 ? 'es' : ''}: ${xpath}`
          highlight.appendChild(label)
        }

        pickerHighlights.push(highlight)
      })
    }

    const updateCursorPosition = (x: number, y: number) => {
      if (!pickerCursor) return
      pickerCursor.style.left = `${x - 10}px`
      pickerCursor.style.top = `${y - 10}px`
    }

    const processMouseUpdate = () => {
      mouseUpdateScheduled = false

      if (!pickerModeActive) return

      updateCursorPosition(lastMouseX, lastMouseY)

      // Get element under cursor (ignore our overlay)
      const el = document.elementFromPoint(lastMouseX, lastMouseY)
      if (!el || !(el instanceof HTMLElement)) return

      // Skip if we're already hovering this element
      if (el === currentHoveredElement) return

      currentHoveredElement = el

      // Calculate minimized XPath
      const xpath = minimizeXPath(el)
      currentXPath = xpath

      // Find all matching elements
      const matchingElements = evaluateXPath(xpath)

      // Highlight all matching elements
      highlightElementsForPicker(matchingElements, xpath)
    }

    const handlePickerMouseMove = (event: MouseEvent) => {
      if (!pickerModeActive) return

      // Store mouse position
      lastMouseX = event.clientX
      lastMouseY = event.clientY

      // Throttle updates using requestAnimationFrame
      if (!mouseUpdateScheduled) {
        mouseUpdateScheduled = true
        requestAnimationFrame(processMouseUpdate)
      }
    }

    const handlePickerClick = async (event: MouseEvent) => {
      if (!pickerModeActive) return

      event.preventDefault()
      event.stopPropagation()

      // Disable picker mode
      disablePickerMode()

      // Get the element that was clicked
      const el = document.elementFromPoint(event.clientX, event.clientY)
      if (!el || !(el instanceof HTMLElement)) return

      log.debug('Picker mode: element selected', el)

      // Calculate XPath and guess config (same as right-click scrape similar)
      const xpath = minimizeXPath(el)
      const guessedConfig = guessScrapeConfigForElement(el)

      if (tabId === null) {
        log.error('tabId not initialized in content script.')
        return
      }

      // Save config to storage (same flow as right-click scrape similar)
      try {
        const elementDetails = {
          xpath,
          text: el.textContent || '',
          html: el.outerHTML,
        }

        // Update storage with guessed config
        await new Promise<void>((resolve, reject) => {
          browser.runtime.sendMessage(
            {
              type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
              payload: {
                updates: { currentScrapeConfig: guessedConfig, elementDetails },
              },
            },
            (response) => {
              if (browser.runtime.lastError) {
                log.error('Error saving picker config to background:', browser.runtime.lastError)
                reject(browser.runtime.lastError)
              } else if (response?.success) {
                log.debug('Picker config saved successfully')
                resolve()
              } else {
                log.error('Failed to save picker config:', response?.error)
                reject(new Error(response?.error || 'Failed to save config'))
              }
            },
          )
        })

        // Now highlight the elements
        const elementsToHighlight = evaluateXPath(guessedConfig.mainSelector)
        highlightMatchingElements(elementsToHighlight)

        // Track element highlighting (from picker)
        trackEvent(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
          elements_count: elementsToHighlight.length,
          is_row_highlight: false,
        })

        // Finally, trigger the scrape
        const scrapedData = scrapePage(guessedConfig)
        const columnOrder = guessedConfig.columns.map((col) => col.name)
        const scrapeResult: ScrapeResult = {
          data: scrapedData,
          columnOrder,
        }

        log.debug('Picker mode scrape complete, data:', scrapeResult)

        // Track scraping completion
        trackEvent(ANALYTICS_EVENTS.SCRAPE_COMPLETION, {
          items_scraped: scrapedData.length,
          columns_count: guessedConfig.columns.length,
        })

        // Send scrape result to background script for storage
        browser.runtime.sendMessage(
          {
            type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
            payload: { updates: { scrapeResult } },
          },
          (response) => {
            if (browser.runtime.lastError) {
              log.error(
                'Error sending picker scrape result to background:',
                browser.runtime.lastError,
              )
            } else if (response?.success) {
              log.debug('Picker scrape result saved successfully')
            } else {
              log.error('Failed to save picker scrape result:', response?.error)
            }
          },
        )
      } catch (err) {
        log.error('Error in picker click handler:', err)
      }
    }

    const handlePickerEscape = (event: KeyboardEvent) => {
      if (!pickerModeActive) return
      if (event.key === 'Escape') {
        event.preventDefault()
        disablePickerMode()
      }
    }

    const enablePickerMode = () => {
      if (pickerModeActive) return

      log.debug('Enabling picker mode')
      pickerModeActive = true

      // Inject styles
      injectPickerStyles()

      // Create cursor
      pickerCursor = createPickerCursor()

      // Change cursor and add event listeners
      document.body.style.cursor = 'crosshair'
      document.addEventListener('mousemove', handlePickerMouseMove, true)
      document.addEventListener('click', handlePickerClick, true)
      document.addEventListener('keydown', handlePickerEscape, true)
    }

    const disablePickerMode = () => {
      if (!pickerModeActive) return

      log.debug('Disabling picker mode')
      pickerModeActive = false

      // Remove cursor
      if (pickerCursor) {
        pickerCursor.remove()
        pickerCursor = null
      }

      // Remove all highlights and restore original element styles
      pickerHighlights.forEach((highlight) => {
        const parent = highlight.parentElement
        if (parent) {
          const originalPosition = highlight.getAttribute('data-original-position')
          const originalZIndex = highlight.getAttribute('data-original-zindex')

          if (originalPosition !== null) {
            parent.style.position = originalPosition
          }
          if (originalZIndex !== null) {
            parent.style.zIndex = originalZIndex
          }
        }
        highlight.remove()
      })
      pickerHighlights = []

      // Restore cursor and remove event listeners
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handlePickerMouseMove, true)
      document.removeEventListener('click', handlePickerClick, true)
      document.removeEventListener('keydown', handlePickerEscape, true)

      // Clean up state
      currentHoveredElement = null
      currentXPath = ''
    }
    // ========== END PICKER MODE ==========

    log.debug('CONTENT SCRIPT ADDING MESSAGE LISTENER')
    // Handle messages from background script
    browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
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
            browser.runtime.sendMessage(
              {
                type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
                payload: { updates: { scrapeResult } },
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

          case MESSAGE_TYPES.ENABLE_PICKER_MODE: {
            log.debug('Enabling picker mode via message')
            enablePickerMode()
            sendResponse({ success: true, message: 'Picker mode enabled' })
            break
          }

          case MESSAGE_TYPES.DISABLE_PICKER_MODE: {
            log.debug('Disabling picker mode via message')
            disablePickerMode()
            sendResponse({ success: true, message: 'Picker mode disabled' })
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
              browser.runtime.sendMessage(
                {
                  type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
                  payload: {
                    updates: { currentScrapeConfig: guessedConfig, elementDetails: details },
                  },
                },
                (response) => {
                  if (browser.runtime.lastError) {
                    log.error(
                      'Error sending element config to background:',
                      browser.runtime.lastError,
                    )
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
            browser.runtime.sendMessage(
              {
                type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
                payload: { updates: { currentScrapeConfig: updatedConfig } },
              },
              (response) => {
                if (browser.runtime.lastError) {
                  log.error(
                    'Error sending guessed config to background:',
                    browser.runtime.lastError,
                  )
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
  },
})
