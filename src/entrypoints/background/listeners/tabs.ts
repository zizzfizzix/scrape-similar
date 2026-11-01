import { reportingListener } from '@/utils/report-rejection'
import log from 'loglevel'
import { clearDemoScrapeFlag, executeDemoScrape } from '../services/demo-scrape'
import { clearSessionState } from '../services/session-storage'

/**
 * Handle tab removal - clean up session and demo scrape data
 */
export const setupTabRemovedListener = (): void => {
  browser.tabs.onRemoved.addListener(
    reportingListener(async (tabId: number) => {
      log.debug(`Tab removed: ${tabId}`)
      await clearSessionState(tabId)
      await clearDemoScrapeFlag(tabId)
    }),
  )
}

/**
 * Handle tab updates - trigger demo scrape after navigation
 */
export const setupTabUpdatedListener = (): void => {
  browser.tabs.onUpdated.addListener(
    reportingListener(
      async (tabId: number, changeInfo: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => {
        if (changeInfo.status === 'complete') {
          const demoData = await demoScrapePendingItem(tabId).getValue()

          if (demoData && tab.url?.includes('wikipedia.org/wiki/')) {
            log.debug('🎬 Demo scrape pending detected for tab', tabId, '- triggering auto-scrape')

            // Remove the flag first so we don't trigger again
            await clearDemoScrapeFlag(tabId)

            await executeDemoScrape(tabId, demoData)
          }
        }
      },
    ),
  )
}
