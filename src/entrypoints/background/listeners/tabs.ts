import {
  clearDemoScrapeFlag,
  executeDemoScrape,
} from '@/entrypoints/background/services/demo-scrape'
import { clearSessionState } from '@/entrypoints/background/services/session-storage'
import log from 'loglevel'

/**
 * Handle tab removal - clean up session and demo scrape data
 */
export const setupTabRemovedListener = (): void => {
  browser.tabs.onRemoved.addListener(async (tabId: number) => {
    log.debug(`Tab removed: ${tabId}`)
    await clearSessionState(tabId)
    await clearDemoScrapeFlag(tabId)
  })
}

/**
 * Handle tab updates - trigger demo scrape after navigation
 */
export const setupTabUpdatedListener = (): void => {
  browser.tabs.onUpdated.addListener(
    async (tabId: number, changeInfo: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
      if (changeInfo.status === 'complete') {
        const demoData = await storage.getItem<ScrapeConfig>(`local:demo_scrape_pending_${tabId}`)

        if (demoData && tab.url?.includes('wikipedia.org/wiki/')) {
          log.debug('🎬 Demo scrape pending detected for tab', tabId, '- triggering auto-scrape')

          // Remove the flag first so we don't trigger again
          await clearDemoScrapeFlag(tabId)

          // Execute the demo scrape
          await executeDemoScrape(tabId, demoData)
        }
      }
    },
  )
}
