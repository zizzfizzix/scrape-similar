/**
 * Centralized URL generation for app navigation
 */

const getAppBaseUrl = (): string => {
  return browser.runtime.getURL('/app.html')
}

/**
 * Get URL for onboarding page
 */
export const getOnboardingUrl = (): string => {
  return `${getAppBaseUrl()}#/onboarding`
}

/**
 * Get URL for scrapes list (history)
 */
export const getScrapesListUrl = (): string => {
  return `${getAppBaseUrl()}#/scrapes`
}

/**
 * Get URL for creating a new scrape
 */
export const getNewScrapeUrl = (): string => {
  return `${getAppBaseUrl()}#/scrapes/new`
}

/**
 * Get URL for viewing a specific scrape
 */
export const getScrapeUrl = (id: string): string => {
  return `${getAppBaseUrl()}#/scrapes/${id}`
}

/**
 * Get URL for duplicating a scrape
 */
export const getDuplicateScrapeUrl = (fromId: string): string => {
  return `${getAppBaseUrl()}#/scrapes/new?from=${fromId}`
}

/**
 * Get URL for loading scrape config from sidepanel tab session
 */
export const getScrapeFromTabUrl = (tabId: number): string => {
  return `${getAppBaseUrl()}#/scrapes/new?tab=${tabId}`
}

/**
 * Get URL for full data view
 */
export const getDataViewUrl = (tabId: number): string => {
  return `${getAppBaseUrl()}#/data/${tabId}`
}
