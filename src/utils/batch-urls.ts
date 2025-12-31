/**
 * Centralized URL generation for batch scrape navigation
 */

/**
 * Get URL for creating a new batch
 */
export const getNewBatchUrl = (): string => {
  return browser.runtime.getURL('/batch-scrape.html')
}

/**
 * Get URL for viewing batch history
 */
export const getBatchHistoryUrl = (): string => {
  return browser.runtime.getURL('/batch-scrape-history.html')
}

/**
 * Get URL for viewing a specific batch
 */
export const getBatchUrl = (batchId: string): string => {
  const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
  url.searchParams.set('batchId', batchId)
  return url.toString()
}

/**
 * Get URL for duplicating a batch
 */
export const getDuplicateBatchUrl = (batchId: string): string => {
  const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
  url.searchParams.set('duplicateFromBatchId', batchId)
  return url.toString()
}

/**
 * Get URL for loading batch config from sidepanel tab session
 */
export const getBatchUrlFromTab = (tabId: number): string => {
  const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
  url.searchParams.set('loadFromTabId', tabId.toString())
  return url.toString()
}
