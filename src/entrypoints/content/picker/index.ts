import {
  highlightElementsForPicker,
  highlightMatchingElements,
  removePickerHighlights,
} from '@/entrypoints/content/highlight'
import {
  mountPickerBanner,
  restoreFixedElements,
  unmountPickerBanner,
  updateBodyMarginForBanner,
  updatePickerBannerContent,
} from '@/entrypoints/content/picker/banner'
import {
  chooseDefaultCandidateIndex,
  generateSelectorCandidates,
} from '@/entrypoints/content/picker/candidates'
import {
  handleLevelChange as handleLevelChangeInternal,
  handlePickerContextMenu,
  handlePickerContextMenuClickOutside,
  removePickerContextMenu,
  showPickerContextMenu,
} from '@/entrypoints/content/picker/context-menu'
import type { ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import {
  evaluateXPath,
  guessScrapeConfigForElement,
  minimizeXPath,
  scrapePage,
} from '@/utils/scraper'
import type { ScrapeConfig, ScrapeResult } from '@/utils/types'
import { MESSAGE_TYPES } from '@/utils/types'
import log from 'loglevel'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

/**
 * Apply crosshair cursor style
 */
export const applyCrosshairCursor = (): void => {
  if (!document.getElementById('scrape-similar-picker-cursor')) {
    const style = document.createElement('style')
    style.id = 'scrape-similar-picker-cursor'
    style.textContent = `
      html.scrape-similar-picker-active,
      html.scrape-similar-picker-active * {
        cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' stroke='%23ff6b6b' stroke-width='2' shape-rendering='crispEdges'><line x1='10' y1='0' x2='10' y2='20'/><line x1='0' y1='10' x2='20' y2='10'/></svg>") 10 10, crosshair !important;
      }
      html.scrape-similar-picker-active [data-wxt-shadow-root],
      html.scrape-similar-picker-active [data-wxt-shadow-root] * {
        cursor: default !important;
      }
    `
    document.head.appendChild(style)
  }

  document.documentElement.classList.add('scrape-similar-picker-active')
}

/**
 * Remove crosshair cursor style
 */
export const removeCrosshairCursor = (): void => {
  document.documentElement.classList.remove('scrape-similar-picker-active')
  const style = document.getElementById('scrape-similar-picker-cursor')
  if (style) style.remove()
}

/**
 * Process mouse update (throttled via requestAnimationFrame)
 */
const processMouseUpdate = (state: ContentScriptState): void => {
  state.mouseUpdateScheduled = false

  if (!state.pickerModeActive) return

  // Get element under cursor (ignore our overlay/banner)
  let el: Element | null = null
  const prevPointerEvents = state.bannerRootEl?.style.pointerEvents
  if (state.bannerRootEl) state.bannerRootEl.style.pointerEvents = 'none'
  try {
    el = document.elementFromPoint(state.lastMouseX, state.lastMouseY)
  } finally {
    if (state.bannerRootEl && prevPointerEvents !== undefined) {
      state.bannerRootEl.style.pointerEvents = prevPointerEvents
    }
  }
  if (!el || !(el instanceof HTMLElement)) return

  // Skip if element is our banner root or any extension UI element
  if (state.bannerRootEl && (el === state.bannerRootEl || el.closest('[data-wxt-shadow-root]'))) {
    // Clear current hover state when over our UI
    if (state.currentHoveredElement !== null) {
      state.currentHoveredElement = null
      removePickerHighlights(state.highlightedElements)
      updatePickerBannerContent(0, '', state)
    }
    return
  }

  // Skip if we're already hovering this element
  if (el === state.currentHoveredElement) return

  state.currentHoveredElement = el

  // Build selector candidates from hovered element up its ancestors
  state.selectorCandidates = generateSelectorCandidates(el)
  state.selectedCandidateIndex = chooseDefaultCandidateIndex(state.selectorCandidates)
  const selector = state.selectorCandidates[state.selectedCandidateIndex]
  state.currentXPath = selector

  // Cache guessed config (for columns); we'll override mainSelector on click
  state.currentGuessedConfig = guessScrapeConfigForElement(el)

  // Find all matching elements using selected candidate
  const matchingElements = evaluateXPath(selector)

  // Highlight all matching elements
  highlightElementsForPicker(matchingElements, state.highlightedElements)

  updatePickerBannerContent(matchingElements.length, selector, state)
}

/**
 * Handle mouse move in picker mode
 */
export const handlePickerMouseMove = (event: MouseEvent, state: ContentScriptState): void => {
  if (!state.pickerModeActive) return

  // Skip highlighting when context menu is open
  if (state.pickerContextMenuOpen) return

  // Store mouse position
  state.lastMouseX = event.clientX
  state.lastMouseY = event.clientY

  // Throttle updates using requestAnimationFrame
  if (!state.mouseUpdateScheduled) {
    state.mouseUpdateScheduled = true
    requestAnimationFrame(() => processMouseUpdate(state))
  }
}

/**
 * Handle click in picker mode
 */
export const handlePickerClick = async (
  event: MouseEvent,
  state: ContentScriptState,
  disablePickerMode: () => void,
): Promise<void> => {
  if (!state.pickerModeActive) return

  // If click originated from inside our banner UI, let it pass through
  const composed = event.composedPath()
  if (state.bannerRootEl && composed.includes(state.bannerRootEl)) {
    return
  }

  // If click originated from inside our context menu, let it pass through
  if (state.pickerContextMenuHost && event.composedPath().includes(state.pickerContextMenuHost)) {
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
  const selectedSelector = state.selectorCandidates[state.selectedCandidateIndex] || xpath
  const guessedConfig = (state.currentGuessedConfig ||
    guessScrapeConfigForElement(el)) as ScrapeConfig
  const finalConfig: ScrapeConfig = { ...guessedConfig, mainSelector: selectedSelector }

  if (state.tabId === null) {
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
            tabId: state.tabId,
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
        tabId: state.tabId,
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
        payload: { tabId: state.tabId, updates: { scrapeResult } },
      },
      async (response) => {
        if (browser.runtime.lastError) {
          log.error('Error sending picker scrape result to background:', browser.runtime.lastError)
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

/**
 * Navigate selector candidates by delta (+1 for broader, -1 for more specific)
 */
const navigateSelectorCandidates = (delta: number, state: ContentScriptState): void => {
  if (state.selectorCandidates.length === 0) return

  const newIndex = state.selectedCandidateIndex + delta
  if (newIndex < 0 || newIndex >= state.selectorCandidates.length) return

  state.selectedCandidateIndex = newIndex
  const sel = state.selectorCandidates[state.selectedCandidateIndex]
  state.currentXPath = sel
  const matches = evaluateXPath(sel)
  highlightElementsForPicker(matches as HTMLElement[], state.highlightedElements)
  updatePickerBannerContent(matches.length, sel, state)
}

/**
 * Handle keydown in picker mode
 */
export const handlePickerKeyDown = (
  event: KeyboardEvent,
  state: ContentScriptState,
  disablePickerMode: () => void,
): void => {
  if (!state.pickerModeActive) return
  const key = event.key
  if (key === 'Escape') {
    event.preventDefault()
    disablePickerMode()
    return
  }
  // '+' makes selector more specific (towards index 0), '-' less specific (towards ancestors)
  if (key === '+' || key === '=') {
    navigateSelectorCandidates(-1, state)
    event.preventDefault()
    return
  }
  if (key === '-' || key === '_') {
    navigateSelectorCandidates(1, state)
    event.preventDefault()
    return
  }
}

/**
 * Enable picker mode
 */
export const enablePickerMode = async (
  ctx: ContentScriptContext,
  state: ContentScriptState,
  disablePickerMode: () => void,
): Promise<void> => {
  if (state.pickerModeActive) return

  log.debug('Enabling picker mode')
  state.pickerModeActive = true

  // Save picker mode state to storage
  if (state.tabId !== null) {
    browser.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: {
        tabId: state.tabId,
        updates: { pickerModeActive: true },
      },
    })
  }

  // Create event handlers
  const handlers = createPickerEventHandlers(ctx, state, disablePickerMode)

  // Change cursor and add event listeners
  applyCrosshairCursor()
  document.addEventListener('mousemove', handlers.mouseMoveHandler, true)
  document.addEventListener('click', handlers.clickHandler, true)
  document.addEventListener('keydown', handlers.keyDownHandler, true)
  document.addEventListener('contextmenu', handlers.contextMenuHandler, true)
  document.addEventListener('mousedown', handlers.clickOutsideHandler, true)
  window.addEventListener('resize', handlers.resizeHandler)

  // Store handlers for cleanup
  state.pickerEventHandlers = handlers

  // Mount shadow-root banner UI at top of page (wait for React to be ready)
  await mountPickerBanner(ctx, state, disablePickerMode)

  // Immediately evaluate what's under the cursor when picker mode is enabled
  // If mouse position is at origin (0,0), use viewport center as fallback
  if (state.lastMouseX === 0 && state.lastMouseY === 0) {
    state.lastMouseX = window.innerWidth / 2
    state.lastMouseY = window.innerHeight / 2
  }
  // Process the initial mouse position
  processMouseUpdate(state)
}

/**
 * Create all event handlers for picker mode
 */
const createPickerEventHandlers = (
  ctx: ContentScriptContext,
  state: ContentScriptState,
  disablePickerMode: () => void,
) => {
  // Level change handler with banner update
  const handleLevelChangeWithUpdate = (level: number) => {
    handleLevelChangeInternal(level, state, (matches, xpath) =>
      updatePickerBannerContent(matches, xpath, state),
    )
  }

  // Context menu removal handler
  const handleRemoveContextMenu = () => {
    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)
  }

  // Show context menu with all dependencies
  const handleShowContextMenu = (x: number, y: number): Promise<void> => {
    return showPickerContextMenu(
      x,
      y,
      ctx,
      state,
      handleLevelChangeWithUpdate,
      handleRemoveContextMenu,
      removeCrosshairCursor,
    )
  }

  return {
    mouseMoveHandler: (e: MouseEvent) => handlePickerMouseMove(e, state),
    clickHandler: (e: MouseEvent) => handlePickerClick(e, state, disablePickerMode),
    keyDownHandler: (e: KeyboardEvent) => handlePickerKeyDown(e, state, disablePickerMode),
    contextMenuHandler: (e: MouseEvent) => handlePickerContextMenu(e, state, handleShowContextMenu),
    clickOutsideHandler: (e: MouseEvent) =>
      handlePickerContextMenuClickOutside(e, state, handleRemoveContextMenu),
    resizeHandler: () => updateBodyMarginForBanner(state),
  }
}

/**
 * Disable picker mode
 */
export const disablePickerMode = (state: ContentScriptState): void => {
  if (!state.pickerModeActive) return

  log.debug('Disabling picker mode')
  state.pickerModeActive = false

  // Save picker mode state to storage
  if (state.tabId !== null) {
    browser.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: {
        tabId: state.tabId,
        updates: { pickerModeActive: false },
      },
    })
  }

  // Remove all highlights and restore original element styles
  removePickerHighlights(state.highlightedElements)
  // Remove banner UI
  unmountPickerBanner(state)

  // Restore cursor and remove event listeners
  removeCrosshairCursor()
  const handlers = state.pickerEventHandlers
  if (handlers) {
    document.removeEventListener('mousemove', handlers.mouseMoveHandler, true)
    document.removeEventListener('click', handlers.clickHandler, true)
    document.removeEventListener('keydown', handlers.keyDownHandler, true)
    document.removeEventListener('contextmenu', handlers.contextMenuHandler, true)
    document.removeEventListener('mousedown', handlers.clickOutsideHandler, true)
    window.removeEventListener('resize', handlers.resizeHandler)
    state.pickerEventHandlers = null
  }

  // Clean up context menu
  removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

  // Clean up state
  state.currentHoveredElement = null
  state.currentXPath = ''
  // Restore original html margin-top
  if (state.originalBodyMarginTopInline !== null) {
    if (state.originalBodyMarginTopInline && state.originalBodyMarginTopInline.trim().length > 0) {
      document.documentElement.style.setProperty(
        'margin-top',
        state.originalBodyMarginTopInline,
        '',
      )
    } else {
      document.documentElement.style.removeProperty('margin-top')
    }
    state.originalBodyMarginTopInline = null
    state.originalBodyMarginTopComputedPx = null
  }

  // Restore fixed/sticky elements to their original positions
  restoreFixedElements(state)
}
