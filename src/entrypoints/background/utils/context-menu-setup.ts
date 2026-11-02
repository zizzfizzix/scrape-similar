import log from 'loglevel'

/**
 * The onboarding page is matched by the running extension's own URL, since the origin
 * differs per browser and per install. Firefox parses an unprivileged extension's
 * `documentUrlPatterns` with `restrictSchemes`, so it gets web pages only: an
 * extension-page pattern there risks `create` rejecting the whole item.
 */
const getContextMenuUrlPatterns = (): string[] => [
  'http://*/*',
  'https://*/*',
  ...(import.meta.env.FIREFOX ? [] : [browser.runtime.getURL('/onboarding.html')]),
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
      documentUrlPatterns: item.documentUrlPatterns || getContextMenuUrlPatterns(),
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
  createContextMenuItem({
    id: 'scrape-similar',
    title: 'Quick scrape',
  })

  createContextMenuItem({
    id: 'scrape-visual-picker',
    title: 'Visual picker',
  })
}
