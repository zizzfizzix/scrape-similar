import log from 'loglevel'

/**
 * Common document URL patterns for context menu items
 */
const CONTEXT_MENU_URL_PATTERNS = [
  'http://*/*',
  'https://*/*',
  `chrome-extension://${browser.runtime.id}/onboarding.html`,
]

interface ContextMenuItem {
  id: string
  title: string
  contexts?: ['selection' | 'page' | 'link' | 'image', ...Browser.contextMenus.ContextType[]]
  documentUrlPatterns?: string[]
}

/**
 * Create a context menu item with standard error handling
 */
const createContextMenuItem = (item: ContextMenuItem): void => {
  browser.contextMenus.create(
    {
      id: item.id,
      title: item.title,
      contexts: item.contexts || ['selection', 'page', 'link', 'image'],
      documentUrlPatterns: item.documentUrlPatterns || CONTEXT_MENU_URL_PATTERNS,
    },
    () => {
      if (browser.runtime.lastError) {
        log.error(`Error creating context menu item '${item.id}':`, browser.runtime.lastError)
      } else {
        log.debug(`Context menu item '${item.id}' created successfully`)
      }
    },
  )
}

/**
 * Initialize all context menu items
 */
export const initializeContextMenus = (): void => {
  // Remove all existing context menus first to avoid duplicate errors
  browser.contextMenus.removeAll(() => {
    createContextMenuItem({
      id: 'scrape-similar',
      title: 'Quick scrape',
    })

    createContextMenuItem({
      id: 'scrape-visual-picker',
      title: 'Visual picker',
    })

    createContextMenuItem({
      id: 'batch-scrape',
      title: 'Batch scrape',
    })
  })
}
