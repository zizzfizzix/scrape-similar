import { applySidePanelDataUpdates } from '@/entrypoints/background/services/session-storage'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { isTest } from '@/utils/modeTest'
import log from 'loglevel'

/**
 * Handle demo scrape setup from onboarding
 * Stores configuration in local storage for pickup after navigation
 */
export const handleDemoScrape = async (
  sender: Browser.runtime.MessageSender,
  sendResponse: (response?: MessageResponse) => void,
): Promise<void> => {
  log.debug('🎬 handleDemoScrape called from sender:', sender)
  try {
    const tabId = sender.tab?.id
    if (!tabId) {
      throw new Error('No tab ID available from sender')
    }

    log.debug('🎬 Setting up demo scrape for tab:', tabId)

    // Store a flag that this tab should auto-scrape after navigation
    // In test mode, use a specific table selector with predefined columns
    // In non-test mode, use a generic link selector with link-specific columns
    const demoConfig: ScrapeConfig = isTest
      ? {
          mainSelector:
            '//table[contains(@class, "wikitable")][1]//tr[position() > 1 and position() <= 11]',
          columns: [
            { name: 'Rank', selector: './td[1]' },
            { name: 'Country/Territory', selector: './td[2]//a[1]' },
            { name: 'Population', selector: './td[3]' },
            { name: 'Percentage', selector: './td[4]' },
            { name: 'Date', selector: './td[5]' },
          ],
        }
      : {
          mainSelector: '//a',
          columns: [
            { name: 'Anchor text', selector: '.' },
            { name: 'URL', selector: '@href' },
            { name: 'Rel', selector: '@rel' },
            { name: 'Target', selector: '@target' },
          ],
        }

    await storage.setItem(`local:demo_scrape_pending_${tabId}`, demoConfig)

    log.debug('🎬 Demo scrape setup complete - stored config for tab', tabId)
    sendResponse({ success: true })
  } catch (error) {
    log.error('🎬 Error setting up demo scrape:', error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Execute demo scrape after navigation completes
 * Called from tab update listener when demo flag is detected
 */
export const executeDemoScrape = async (tabId: number, config: ScrapeConfig): Promise<void> => {
  try {
    // Save the config to session storage
    await applySidePanelDataUpdates(tabId, {
      currentScrapeConfig: config,
    })

    // Highlight the elements
    const highlightResp = await browser.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
      payload: { selector: config.mainSelector },
    })

    await applySidePanelDataUpdates(tabId, {
      highlightMatchCount: highlightResp.matchCount,
      highlightError: highlightResp.error,
    })

    if (highlightResp?.success && highlightResp.matchCount > 0) {
      // Trigger the scrape
      const scrapeResp = await browser.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })

      if (scrapeResp?.success) {
        log.debug('🎬 Demo scrape completed successfully')
        trackEvent(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, { success: true })

        // Enable visual picker mode so user can try it immediately
        try {
          await browser.tabs.sendMessage(tabId, {
            type: MESSAGE_TYPES.ENABLE_PICKER_MODE,
            payload: { source: 'demo_scrape' },
          })
          log.debug('🎬 Visual picker mode enabled after demo scrape')
        } catch (pickerError) {
          log.warn('🎬 Failed to enable picker mode after demo:', pickerError)
          // Non-fatal error, continue
        }
      } else {
        log.warn('🎬 Demo scrape failed:', scrapeResp?.error)
        trackEvent(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
          success: false,
          error: scrapeResp?.error,
        })
      }
    }
  } catch (error) {
    log.error('🎬 Error in auto demo scrape:', error)
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: false,
      error: (error as Error).message,
    })
  }
}

/**
 * Clean up demo scrape flag for a tab
 */
export const clearDemoScrapeFlag = async (tabId: number): Promise<void> => {
  try {
    await storage.removeItem(`local:demo_scrape_pending_${tabId}`)
  } catch (error) {
    log.error(`Error clearing demo scrape flag for tab ${tabId}:`, error)
  }
}
