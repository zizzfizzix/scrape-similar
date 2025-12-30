import { cleanupExpiredScrapes, setupCleanupAlarm } from '@/entrypoints/background/listeners/alarms'
import { injectContentScriptToAllTabs } from '@/entrypoints/background/utils/content-injection'
import {
  initializeContextMenus,
  updateBatchScrapeMenuVisible,
} from '@/entrypoints/background/utils/context-menu-setup'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { FEATURE_FLAGS, initializeFeatureFlags, isFeatureEnabled } from '@/utils/feature-flags'
import { initializeStorage } from '@/utils/storage'
import log from 'loglevel'

/**
 * Handle extension installation and updates
 */
export const setupInstallListener = (): void => {
  browser.runtime.onInstalled.addListener(async (details: Browser.runtime.InstalledDetails) => {
    log.debug('Scrape Similar extension installed')

    // Initialize storage
    await initializeStorage()

    // Initialize feature flags storage
    await initializeFeatureFlags()

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

    // Set initial batch scrape menu visibility based on feature flag
    // Storage watchers will ensure the visibility updates correctly once menus are created
    const batchScrapeEnabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
    updateBatchScrapeMenuVisible(batchScrapeEnabled)

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

    // Set up cleanup alarm for expired single scrapes
    await setupCleanupAlarm()

    // Run initial cleanup
    await cleanupExpiredScrapes()

    log.debug('Service worker is running')

    // Track extension installation/update
    trackEvent(ANALYTICS_EVENTS.EXTENSION_INSTALLATION)
  })

  // Watch for feature flag changes and update context menu accordingly
  const updateMenuFromFlags = async () => {
    const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
    updateBatchScrapeMenuVisible(enabled)
  }

  storage.watch('local:featureFlags', updateMenuFromFlags)
  storage.watch('local:featureFlagOverrides', updateMenuFromFlags)
}

/**
 * Handle browser startup (extension enabled)
 */
export const setupStartupListener = (): void => {
  browser.runtime.onStartup.addListener(async () => {
    injectContentScriptToAllTabs()

    // Set initial batch scrape menu visibility on startup
    const batchScrapeEnabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
    updateBatchScrapeMenuVisible(batchScrapeEnabled)

    // Set up cleanup alarm
    await setupCleanupAlarm()

    // Run cleanup on startup
    await cleanupExpiredScrapes()

    log.debug('Service worker is running')
  })
}
