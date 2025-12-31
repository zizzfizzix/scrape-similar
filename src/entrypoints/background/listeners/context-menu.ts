import {
  applySidePanelDataUpdates,
  getSessionState,
} from '@/entrypoints/background/services/session-storage'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { isInjectableUrl } from '@/utils/isInjectableUrl'
import log from 'loglevel'

/**
 * Handle context menu item clicks
 */
export const setupContextMenuListener = (): void => {
  browser.contextMenus.onClicked.addListener(
    async (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => {
      log.debug('Context menu clicked:', info, tab)

      if (!tab?.id) {
        log.error('No tab ID available')
        return
      }
      const targetTabId = tab.id

      if (info.menuItemId === 'scrape-similar') {
        await handleQuickScrape(targetTabId, info)
      } else if (info.menuItemId === 'scrape-visual-picker') {
        await handleVisualPicker(targetTabId, tab, info)
      } else if (info.menuItemId === 'batch-scrape') {
        await handleBatchScrape(targetTabId, tab, info)
      }
    },
  )
}

/**
 * Handle 'Quick scrape' context menu action
 */
const handleQuickScrape = async (
  targetTabId: number,
  info: Browser.contextMenus.OnClickData,
): Promise<void> => {
  log.debug('Scrape similar selected, opening side panel and triggering element details save...')

  // Track context menu quick scrape usage
  trackEvent(ANALYTICS_EVENTS.CONTEXT_MENU_QUICK_SCRAPE, {
    has_selection: !!info.selectionText,
  })

  // Always open the side panel (safe even if already open)
  try {
    await browser.sidePanel.open({ tabId: targetTabId })
    log.debug(`Side panel opened for tab ${targetTabId}`)
  } catch (error) {
    log.error(`Error opening side panel for tab ${targetTabId}:`, error)
  }

  // Tell content script to save element details to storage, then trigger highlight, then scrape
  try {
    const saveResp = await browser.tabs.sendMessage(targetTabId, {
      type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE,
    })
    if (!saveResp?.success)
      throw new Error('Failed to save element details: ' + (saveResp?.error || 'Unknown error'))
    log.debug('Told content script to save element details to storage.')

    // Fetch the latest config from session storage
    const currentData = (await getSessionState(targetTabId)) || {}
    const config = currentData.currentScrapeConfig
    if (config && config.mainSelector) {
      // Highlight elements before scraping
      const highlightResp = await browser.tabs.sendMessage(targetTabId, {
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector: config.mainSelector, shouldScroll: false },
      })
      // Store highlight result in session storage immediately
      await applySidePanelDataUpdates(targetTabId, {
        highlightMatchCount: highlightResp.matchCount,
        highlightError: highlightResp.error,
      })
      if (
        !highlightResp?.success ||
        typeof highlightResp.matchCount !== 'number' ||
        highlightResp.matchCount === 0
      ) {
        log.warn('Highlight failed or no elements found for selector, aborting scrape.')
        return
      }
      // Send START_SCRAPE to content script
      const scrapeResp = await browser.tabs.sendMessage(targetTabId, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })
      if (!scrapeResp?.success)
        throw new Error('Failed to trigger scrape: ' + (scrapeResp?.error || 'Unknown error'))
      log.debug('Scrape triggered successfully.')

      // Track successful scrape initiation from context menu
      trackEvent(ANALYTICS_EVENTS.SCRAPE_INITIATION_FROM_CONTEXT_MENU, {
        has_config: !!config,
      })
    } else {
      log.warn('No currentScrapeConfig found in session storage, cannot auto-scrape.')
    }
  } catch (error) {
    log.error('Error in right-click scrape flow:', error)
  }
}

/**
 * Handle 'Visual picker' context menu action
 */
const handleVisualPicker = async (
  targetTabId: number,
  tab: Browser.tabs.Tab,
  info: Browser.contextMenus.OnClickData,
): Promise<void> => {
  log.debug('Scrape visual picker selected, toggling picker mode...')

  // Track context menu visual picker usage
  trackEvent(ANALYTICS_EVENTS.CONTEXT_MENU_VISUAL_PICKER)

  // Check if URL is injectable (same check as keyboard shortcut)
  if (!isInjectableUrl(tab.url)) {
    log.warn('Cannot enable visual picker on non-injectable URL:', tab.url)
    return
  }

  try {
    // Toggle picker mode (same as keyboard shortcut)
    await browser.tabs.sendMessage(targetTabId, {
      type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
      payload: { source: 'context_menu' },
    })
    log.debug('Visual picker toggled via context menu')
  } catch (error) {
    log.error('Error handling scrape-visual-picker context menu:', error)
  }
}

/**
 * Handle 'Batch scrape' context menu action
 */
const handleBatchScrape = async (
  targetTabId: number,
  tab: Browser.tabs.Tab,
  info: Browser.contextMenus.OnClickData,
): Promise<void> => {
  log.debug('Batch scrape selected from context menu')

  // Track context menu batch scrape usage
  trackEvent(ANALYTICS_EVENTS.CONTEXT_MENU_BATCH_SCRAPE)

  try {
    // Open batch scrape page directly (we're already in the background script)
    const url = browser.runtime.getURL('/app.html#/scrapes/new')
    await browser.tabs.create({ url })
    log.debug('Batch scrape page opened via context menu')
  } catch (error) {
    log.error('Error handling batch-scrape context menu:', error)
  }
}
