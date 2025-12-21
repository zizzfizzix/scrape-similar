import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'

log.setDefaultLevel('error')

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  main(ctx) {
    // Always log at trace level in development or test mode
    if (isDevOrTest) {
      log.setLevel('trace')
    } else {
      // Request current debug mode from the background script since content scripts
      // do not have direct access to extension storage APIs.
      browser.runtime.sendMessage(
        { type: MESSAGE_TYPES.GET_DEBUG_MODE },
        (response: MessageResponse) => {
          if (
            response.success === true &&
            'debugMode' in response &&
            typeof response.debugMode === 'boolean'
          ) {
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

    // Keep a reference to the WXT content script context for UI mounting
    const contentCtx = ctx

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
      if (
        response.success === false ||
        !('tabId' in response) ||
        typeof response.tabId !== 'number'
      ) {
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
    let highlightedElements = new Map<
      HTMLElement,
      { outline: string; outlineOffset: string; boxShadow: string }
    >()
    let pickerFloatingLabel: HTMLDivElement | null = null
    let currentHoveredElement: HTMLElement | null = null
    let currentXPath = ''
    let currentGuessedConfig: ScrapeConfig | null = null
    let selectorCandidates: string[] = []
    let selectedCandidateIndex = 0
    // Animation frame throttling for mouse move
    let mouseUpdateScheduled = false
    let lastMouseX = 0
    let lastMouseY = 0

    // ========== PICKER BANNER (ShadowRoot UI) ==========
    let pickerBannerUi: any | null = null
    let bannerRootEl: HTMLDivElement | null = null
    let bannerCountEl: HTMLSpanElement | null = null
    let bannerXPathEl: HTMLInputElement | null = null
    let bannerUpBtn: HTMLButtonElement | null = null
    let bannerDownBtn: HTMLButtonElement | null = null
    let bannerCloseBtn: HTMLButtonElement | null = null
    let originalBodyMarginTopInline: string | null = null
    let originalBodyMarginTopComputedPx: number | null = null
    let bannerSetData: ((count: number, xpath: string) => void) | null = null

    const updatePickerBannerContent = (matches: number, xpath: string) => {
      if (bannerCountEl) bannerCountEl.textContent = String(matches)
      if (bannerXPathEl) bannerXPathEl.value = xpath
      if (typeof bannerSetData === 'function') bannerSetData(matches, xpath)
      updateBodyMarginForBanner()
    }

    const selectCandidateByDelta = (delta: number) => {
      if (selectorCandidates.length === 0) return
      const nextIndex = selectedCandidateIndex + delta
      if (nextIndex < 0 || nextIndex > selectorCandidates.length - 1) return
      selectedCandidateIndex = nextIndex
      const sel = selectorCandidates[selectedCandidateIndex]
      currentXPath = sel
      const matches = evaluateXPath(sel)
      highlightElementsForPicker(matches as HTMLElement[])
      ensureFloatingLabel()
      updateFloatingLabelContent(matches.length, sel)
      updateFloatingLabelPosition(lastMouseX, lastMouseY)
      updatePickerBannerContent(matches.length, sel)
    }

    const updateBodyMarginForBanner = () => {
      if (!pickerModeActive || !bannerRootEl) return
      const height = bannerRootEl.getBoundingClientRect().height || 0
      if (originalBodyMarginTopInline === null) {
        originalBodyMarginTopInline = document.body.style.marginTop
      }
      if (originalBodyMarginTopComputedPx === null) {
        const computed = parseFloat(getComputedStyle(document.body).marginTop || '0') || 0
        originalBodyMarginTopComputedPx = computed
      }
      const base = originalBodyMarginTopComputedPx || 0
      document.body.style.setProperty('margin-top', `${base + height}px`, 'important')
    }

    const mountPickerBanner = async () => {
      if (pickerBannerUi) return
      try {
        const ui = await createShadowRootUi(contentCtx, {
          name: 'scrape-similar-picker-banner',
          position: 'inline',
          anchor: 'body',
          onMount: (container: HTMLElement) => {
            const appRoot = document.createElement('div')
            container.appendChild(appRoot)
            // React mount point; we rely on global React build in this project
            // Dynamically import the React banner to avoid heavy deps at load
            import('@/entrypoints/content/ui/PickerBanner').then((mod) => {
              const { mountPickerBannerReact } = mod as any
              const api = mountPickerBannerReact(appRoot, {
                getState: () => ({
                  count: 0,
                  xpath: currentXPath,
                }),
                onUp: () => selectCandidateByDelta(-1),
                onDown: () => selectCandidateByDelta(1),
                onClose: () => disablePickerMode(),
              })
              bannerSetData = api.setData
              ;(appRoot as any).__unmount = api.unmount
            })
            bannerRootEl = container as HTMLDivElement
            return appRoot
          },
          onRemove: (appRoot?: HTMLElement) => {
            try {
              const unmount = (appRoot as any)?.__unmount
              if (typeof unmount === 'function') unmount()
            } catch {}
            bannerRootEl = null
            bannerCountEl = null
            bannerXPathEl = null
            bannerUpBtn = null
            bannerDownBtn = null
            bannerCloseBtn = null
            bannerSetData = null
          },
        })
        pickerBannerUi = ui
        ui.mount()
        // After mount, ensure page content is offset below banner
        updateBodyMarginForBanner()
      } catch (e) {
        log.warn('Failed to mount picker banner UI', e)
      }
    }

    const unmountPickerBanner = () => {
      try {
        if (pickerBannerUi) {
          pickerBannerUi.remove?.()
          pickerBannerUi = null
        }
      } catch (e) {
        // ignore
      }
    }

    // Inject styles for picker overlays (only once)
    const injectPickerStyles = () => {
      if (document.getElementById('scrape-similar-picker-styles')) return

      const style = document.createElement('style')
      style.id = 'scrape-similar-picker-styles'
      style.textContent = `
        .scrape-similar-picker-highlight {
          position: absolute;
          pointer-events: none;
          outline: 2px solid #ff6b6b;
          outline-offset: 2px;
          background: rgba(255, 107, 107, 0.1);
          box-sizing: border-box;
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
        }
        .scrape-similar-picker-floating-label {
          position: fixed;
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
      `
      document.head.appendChild(style)
    }

    const applyCrosshairCursor = () => {
      if (document.getElementById('scrape-similar-crosshair-style')) return
      const style = document.createElement('style')
      style.id = 'scrape-similar-crosshair-style'
      style.textContent = `html, body, * { cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' stroke='%23ff6b6b' stroke-width='2' shape-rendering='crispEdges'><line x1='10' y1='0' x2='10' y2='20'/><line x1='0' y1='10' x2='20' y2='10'/></svg>") 10 10, crosshair !important; }`
      document.head.appendChild(style)
    }

    const removeCrosshairCursor = () => {
      const style = document.getElementById('scrape-similar-crosshair-style')
      if (style) style.remove()
    }

    const removePickerHighlights = () => {
      highlightedElements.forEach((original, el) => {
        el.style.outline = original.outline
        el.style.outlineOffset = original.outlineOffset
        el.style.boxShadow = original.boxShadow
      })
      highlightedElements.clear()
    }

    // Use direct element styling for highlight to keep stacking context close to the node
    // and avoid global z-index issues (we restore original inline styles on cleanup).

    const highlightElementsForPicker = (elements: HTMLElement[]) => {
      // Clear previous element inline styling
      removePickerHighlights()

      elements.forEach((el) => {
        // Save original inline styles we are about to modify
        const original = {
          outline: el.style.outline,
          outlineOffset: el.style.outlineOffset,
          boxShadow: el.style.boxShadow,
        }
        highlightedElements.set(el, original)

        // Apply non-intrusive highlight directly to the element
        el.style.outline = '2px solid #ff6b6b'
        el.style.outlineOffset = '-1px'
        el.style.boxShadow = 'inset 0 0 0 9999px rgba(255, 107, 107, 0.16)'
      })
    }

    const ensureFloatingLabel = () => {
      if (!pickerFloatingLabel) {
        pickerFloatingLabel = document.createElement('div')
        pickerFloatingLabel.className = 'scrape-similar-picker-floating-label'
        document.body.appendChild(pickerFloatingLabel)
      }
    }

    const updateFloatingLabelContent = (matches: number, xpath: string) => {
      if (!pickerFloatingLabel) return
      pickerFloatingLabel.textContent = `${matches} match${matches !== 1 ? 'es' : ''}: ${xpath}`
    }

    const updateFloatingLabelPosition = (x: number, y: number) => {
      if (!pickerFloatingLabel) return
      const offset = 12
      const margin = 4
      let left = x + offset
      let top = y + offset
      const labelWidth = pickerFloatingLabel.offsetWidth
      const labelHeight = pickerFloatingLabel.offsetHeight
      const maxLeft = window.innerWidth - labelWidth - margin
      const maxTop = window.innerHeight - labelHeight - margin
      if (left > maxLeft) left = maxLeft
      if (top > maxTop) top = maxTop
      if (left < margin) left = margin
      if (top < margin) top = margin
      pickerFloatingLabel.style.left = `${left}px`
      pickerFloatingLabel.style.top = `${top}px`
    }

    const generateSelectorCandidates = (start: HTMLElement, maxLevels: number = 10): string[] => {
      const candidates: string[] = []
      let node: HTMLElement | null = start
      let levels = 0
      while (node && node !== document.body && levels <= maxLevels) {
        const xp = minimizeXPath(node)
        if (!candidates.includes(xp)) candidates.push(xp)
        node = node.parentElement as HTMLElement | null
        levels += 1
      }
      return candidates
    }

    const chooseDefaultCandidateIndex = (cands: string[]): number => {
      for (let i = 0; i < cands.length; i++) {
        const count = evaluateXPath(cands[i]).length
        if (count >= 2) return i
      }
      return 0
    }

    const processMouseUpdate = () => {
      mouseUpdateScheduled = false

      if (!pickerModeActive) return

      // Get element under cursor (ignore our overlay/banner)
      let el: Element | null = null
      const prevPointerEvents = bannerRootEl?.style.pointerEvents
      if (bannerRootEl) bannerRootEl.style.pointerEvents = 'none'
      try {
        el = document.elementFromPoint(lastMouseX, lastMouseY)
      } finally {
        if (bannerRootEl && prevPointerEvents !== undefined) {
          bannerRootEl.style.pointerEvents = prevPointerEvents
        }
      }
      if (!el || !(el instanceof HTMLElement)) return

      // Skip if we're already hovering this element
      if (el === currentHoveredElement) return

      currentHoveredElement = el

      // Build selector candidates from hovered element up its ancestors
      selectorCandidates = generateSelectorCandidates(el)
      selectedCandidateIndex = chooseDefaultCandidateIndex(selectorCandidates)
      const selector = selectorCandidates[selectedCandidateIndex]
      currentXPath = selector

      // Cache guessed config (for columns); we'll override mainSelector on click
      currentGuessedConfig = guessScrapeConfigForElement(el)

      // Find all matching elements using selected candidate
      const matchingElements = evaluateXPath(selector)

      // Highlight all matching elements
      highlightElementsForPicker(matchingElements)

      // Update floating label content and position
      ensureFloatingLabel()
      updateFloatingLabelContent(matchingElements.length, selector)
      updateFloatingLabelPosition(lastMouseX, lastMouseY)
      updatePickerBannerContent(matchingElements.length, selector)
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

      // If click originated from inside our banner UI, let it pass through
      const composed = event.composedPath()
      if (bannerRootEl && composed.includes(bannerRootEl)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // Disable picker mode
      disablePickerMode()

      // Get the element that was clicked
      const el = document.elementFromPoint(event.clientX, event.clientY)
      if (!el || !(el instanceof HTMLElement)) return

      log.debug('Picker mode: element selected', el)

      // Use currently selected candidate selector for final scrape
      const xpath = minimizeXPath(el)
      const selectedSelector = selectorCandidates[selectedCandidateIndex] || xpath
      const guessedConfig = (currentGuessedConfig ||
        guessScrapeConfigForElement(el)) as ScrapeConfig
      const finalConfig: ScrapeConfig = { ...guessedConfig, mainSelector: selectedSelector }

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

        // Update storage with the finalized config that uses the selected mainSelector
        await new Promise<void>((resolve, reject) => {
          browser.runtime.sendMessage(
            {
              type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
              payload: {
                updates: { currentScrapeConfig: finalConfig, elementDetails },
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

        // Now highlight the elements (do not scroll during picker flow)
        const elementsToHighlight = evaluateXPath(finalConfig.mainSelector)
        highlightMatchingElements(elementsToHighlight, { shouldScroll: false })

        // Persist validation state so the UI marks the selector as validated
        browser.runtime.sendMessage({
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            updates: {
              highlightMatchCount: elementsToHighlight.length,
              highlightError: null,
            },
          },
        })

        // Track element highlighting (from picker)
        trackEvent(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
          elements_count: elementsToHighlight.length,
          is_row_highlight: false,
        })

        // Finally, trigger the scrape
        const scrapedData = scrapePage(finalConfig)
        const columnOrder = finalConfig.columns.map((col) => col.name)
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
          async (response) => {
            if (browser.runtime.lastError) {
              log.error(
                'Error sending picker scrape result to background:',
                browser.runtime.lastError,
              )
            } else if (response?.success) {
              log.debug('Picker scrape result saved successfully')
              // Ensure sidepanel is open so the user sees results even if it was closed
              await browser.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })
            } else {
              log.error('Failed to save picker scrape result:', response?.error)
            }
          },
        )
      } catch (err) {
        log.error('Error in picker click handler:', err)
      }
    }

    const handlePickerKeyDown = (event: KeyboardEvent) => {
      if (!pickerModeActive) return
      const key = event.key
      if (key === 'Escape') {
        event.preventDefault()
        disablePickerMode()
        return
      }
      // '+' makes selector more specific (towards index 0), '-' less specific (towards ancestors)
      if (key === '+' || key === '=') {
        if (selectorCandidates.length > 0 && selectedCandidateIndex > 0) {
          selectedCandidateIndex -= 1
          const sel = selectorCandidates[selectedCandidateIndex]
          currentXPath = sel
          const matches = evaluateXPath(sel)
          highlightElementsForPicker(matches as HTMLElement[])
          ensureFloatingLabel()
          updateFloatingLabelContent(matches.length, sel)
          updateFloatingLabelPosition(lastMouseX, lastMouseY)
          updatePickerBannerContent(matches.length, sel)
        }
        event.preventDefault()
        return
      }
      if (key === '-' || key === '_') {
        if (
          selectorCandidates.length > 0 &&
          selectedCandidateIndex < selectorCandidates.length - 1
        ) {
          selectedCandidateIndex += 1
          const sel = selectorCandidates[selectedCandidateIndex]
          currentXPath = sel
          const matches = evaluateXPath(sel)
          highlightElementsForPicker(matches as HTMLElement[])
          ensureFloatingLabel()
          updateFloatingLabelContent(matches.length, sel)
          updateFloatingLabelPosition(lastMouseX, lastMouseY)
          updatePickerBannerContent(matches.length, sel)
        }
        event.preventDefault()
        return
      }
    }

    const enablePickerMode = () => {
      if (pickerModeActive) return

      log.debug('Enabling picker mode')
      pickerModeActive = true

      // Inject styles
      injectPickerStyles()
      // Mount shadow-root banner UI at top of page
      mountPickerBanner()

      // Change cursor and add event listeners
      applyCrosshairCursor()
      document.body.style.cursor = 'crosshair'
      document.addEventListener('mousemove', handlePickerMouseMove, true)
      document.addEventListener('click', handlePickerClick, true)
      document.addEventListener('keydown', handlePickerKeyDown, true)
      window.addEventListener('resize', updateBodyMarginForBanner)

      // Create floating label
      ensureFloatingLabel()
    }

    const disablePickerMode = () => {
      if (!pickerModeActive) return

      log.debug('Disabling picker mode')
      pickerModeActive = false

      // Remove all highlights and restore original element styles
      removePickerHighlights()
      // Remove banner UI
      unmountPickerBanner()

      // Restore cursor and remove event listeners
      removeCrosshairCursor()
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handlePickerMouseMove, true)
      document.removeEventListener('click', handlePickerClick, true)
      document.removeEventListener('keydown', handlePickerKeyDown, true)
      window.removeEventListener('resize', updateBodyMarginForBanner)

      // Clean up state
      currentHoveredElement = null
      currentXPath = ''
      if (pickerFloatingLabel) {
        pickerFloatingLabel.remove()
        pickerFloatingLabel = null
      }
      // Restore original body margin-top
      if (originalBodyMarginTopInline !== null) {
        if (originalBodyMarginTopInline && originalBodyMarginTopInline.trim().length > 0) {
          document.body.style.setProperty('margin-top', originalBodyMarginTopInline, '')
        } else {
          document.body.style.removeProperty('margin-top')
        }
        originalBodyMarginTopInline = null
        originalBodyMarginTopComputedPx = null
      }
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
              break
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

          case MESSAGE_TYPES.TOGGLE_PICKER_MODE: {
            log.debug('Toggling picker mode via message')
            if (pickerModeActive) {
              disablePickerMode()
              sendResponse({ success: true, message: 'Picker mode disabled' })
            } else {
              enablePickerMode()
              sendResponse({ success: true, message: 'Picker mode enabled' })
            }
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
    const highlightMatchingElements = (
      elements: Element[],
      options?: { shouldScroll?: boolean },
    ) => {
      const shouldScroll = options?.shouldScroll !== false
      // Scroll first element into view if available (unless disabled)
      if (shouldScroll && elements.length > 0 && !isVisibleAndInViewport(elements[0])) {
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
