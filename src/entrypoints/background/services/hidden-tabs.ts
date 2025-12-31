import { isInjectableUrl } from '@/utils/isInjectableUrl'
import log from 'loglevel'

const PAGE_LOAD_TIMEOUT = 30000 // 30 seconds

export interface HiddenTabResult {
  tabId: number
  success: boolean
  error?: string
}

/**
 * Create a hidden tab for scraping
 */
export const createHiddenTab = async (
  url: string,
  disableJs: boolean = false,
): Promise<HiddenTabResult> => {
  try {
    // Validate URL is injectable
    if (!isInjectableUrl(url)) {
      return {
        tabId: -1,
        success: false,
        error: 'URL is not injectable (restricted by browser)',
      }
    }

    // Create tab in background (inactive)
    const tab = await browser.tabs.create({
      url,
      active: false,
    })

    if (!tab.id) {
      return {
        tabId: -1,
        success: false,
        error: 'Failed to create tab',
      }
    }

    log.debug(`Created hidden tab ${tab.id} for URL: ${url}`)

    // Wait for tab to load with timeout
    const loaded = await waitForTabLoad(tab.id, PAGE_LOAD_TIMEOUT)

    if (!loaded) {
      // Clean up failed tab
      await closeHiddenTab(tab.id)
      return {
        tabId: tab.id,
        success: false,
        error: 'Page load timeout',
      }
    }

    return {
      tabId: tab.id,
      success: true,
    }
  } catch (error) {
    log.error('Error creating hidden tab:', error)
    return {
      tabId: -1,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Wait for a tab to finish loading
 */
const waitForTabLoad = (tabId: number, timeout: number): Promise<boolean> => {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | null = null
    let completed = false

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      browser.tabs.onUpdated.removeListener(listener)
      completed = true
    }

    const listener = (
      updatedTabId: number,
      changeInfo: { status?: string },
      tab: Browser.tabs.Tab,
    ) => {
      if (completed) return
      if (updatedTabId !== tabId) return

      // Check if page is complete
      if (changeInfo.status === 'complete' || tab.status === 'complete') {
        cleanup()
        resolve(true)
      }
    }

    // Set timeout
    timeoutId = setTimeout(() => {
      if (completed) return
      cleanup()
      log.warn(`Tab ${tabId} load timeout after ${timeout}ms`)
      resolve(false)
    }, timeout)

    // Listen for tab updates
    browser.tabs.onUpdated.addListener(listener)

    // Check if already loaded
    browser.tabs.get(tabId).then((tab) => {
      if (completed) return
      if (tab.status === 'complete') {
        cleanup()
        resolve(true)
      }
    })
  })
}

/**
 * Close a hidden tab
 */
export const closeHiddenTab = async (tabId: number): Promise<void> => {
  try {
    await browser.tabs.remove(tabId)
    log.debug(`Closed hidden tab ${tabId}`)
  } catch (error) {
    log.error(`Error closing hidden tab ${tabId}:`, error)
  }
}

/**
 * Check if a tab exists
 */
export const tabExists = async (tabId: number): Promise<boolean> => {
  try {
    await browser.tabs.get(tabId)
    return true
  } catch {
    return false
  }
}
