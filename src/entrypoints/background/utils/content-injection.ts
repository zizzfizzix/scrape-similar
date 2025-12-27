import { isInjectableUrl } from '@/utils/isInjectableUrl'
import log from 'loglevel'

/**
 * Inject content script into all eligible tabs
 * Used on extension install/update and browser startup
 */
export const injectContentScriptToAllTabs = async (): Promise<void> => {
  // Get all tabs
  const tabs = await browser.tabs.query({})

  // Get content scripts from manifest
  const contentScripts = browser.runtime.getManifest().content_scripts
  if (!contentScripts?.length) return

  // Get injectable tabs and script files
  const injectableTabs = tabs.filter((tab: Browser.tabs.Tab) => tab.id && isInjectableUrl(tab.url))
  const scriptFiles = contentScripts
    .flatMap((script) => script.js)
    .filter((script) => script !== undefined)

  // Inject scripts into each eligible tab
  for (const tab of injectableTabs) {
    for (const file of scriptFiles) {
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id! },
          files: [file],
        })
      } catch (error) {
        // Ignore errors for restricted pages
        log.warn(
          `Failed to inject content script into tab ${tab.id} with url ${tab.url}:`,
          (error as typeof browser.runtime.lastError)?.message,
        )
      }
    }
  }
}
