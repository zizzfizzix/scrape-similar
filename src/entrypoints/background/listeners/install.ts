import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { initializeStorage } from '@/utils/storage'
import log from 'loglevel'
import { injectContentScriptToAllTabs } from '../utils/content-injection'
import { initializeContextMenus } from '../utils/context-menu-setup'

/**
 * Handle extension installation and updates
 */
export const setupInstallListener = (): void => {
  browser.runtime.onInstalled.addListener(async (details: Browser.runtime.InstalledDetails) => {
    log.debug('Scrape Similar extension installed')

    // Initialize storage
    await initializeStorage()

    // Show onboarding on first install (no storage check)
    if (details.reason === 'install') {
      try {
        await browser.tabs.create({
          url: browser.runtime.getURL('/onboarding.html'),
          active: true,
        })
        log.debug('Opened onboarding page for new installation')
      } catch (error) {
        log.error('Error opening onboarding page:', error)
      }
    }

    // Create context menu items
    initializeContextMenus()

    // Set side panel behavior - make the action icon open/close the sidepanel
    try {
      await browser.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true,
      })
      log.debug('Side panel behavior set successfully - action icon will now toggle the panel')
    } catch (error) {
      log.error('Error setting side panel behavior:', error)
    }

    // Inject content script into all tabs on install/update
    injectContentScriptToAllTabs()

    log.debug('Service worker is running')

    // Track extension installation/update
    trackEvent(ANALYTICS_EVENTS.EXTENSION_INSTALLATION)
  })
}

/**
 * Handle browser startup (extension enabled)
 */
export const setupStartupListener = (): void => {
  browser.runtime.onStartup.addListener(() => {
    injectContentScriptToAllTabs()
    log.debug('Service worker is running')
  })
}
