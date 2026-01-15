import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import type { DistinctId } from '@/utils/distinct-id'
import { DISTINCT_ID_KEY } from '@/utils/distinct-id'
import { initializeStorage } from '@/utils/storage'
import log from 'loglevel'
import { injectContentScriptToAllTabs } from '../utils/content-injection'
import { initializeContextMenus } from '../utils/context-menu-setup'

const UNINSTALL_SURVEY_URL =
  'https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f'

/**
 * Set the uninstall URL to open a PostHog survey with the user's distinct_id if it exists.
 * Note: We only use the distinct_id if it was already created (i.e., user opted into tracking).
 * We don't create a new one to respect users who never opted in.
 *
 * @param distinctId - Optional distinct_id to use. If undefined, reads from storage.
 *                     Pass null explicitly to indicate no distinct_id (user opted out).
 */
export const setupUninstallUrl = async (distinctId?: DistinctId | null): Promise<void> => {
  try {
    // If undefined (no argument), read from storage; otherwise use the provided value (including null)
    const resolvedDistinctId =
      distinctId === undefined ? await storage.getItem<DistinctId>(DISTINCT_ID_KEY) : distinctId

    let uninstallUrl = UNINSTALL_SURVEY_URL
    if (resolvedDistinctId) {
      uninstallUrl = `${UNINSTALL_SURVEY_URL}?distinct_id=${resolvedDistinctId}`
      log.debug('Uninstall URL set with distinct_id:', resolvedDistinctId)
    } else {
      log.debug('Uninstall URL set without distinct_id (user never opted in)')
    }

    await browser.runtime.setUninstallURL(uninstallUrl)
  } catch (error) {
    log.error('Error setting uninstall URL:', error)
  }
}

/**
 * Initialize uninstall URL functionality:
 * - Sets the initial uninstall URL based on current distinct_id
 * - Sets up a watcher to update the URL when distinct_id changes
 *
 * This ensures Chrome always has the correct uninstall URL, whether the user
 * opts in/out of tracking at any point.
 */
export const initializeUninstallUrl = async (): Promise<void> => {
  // Set initial uninstall URL
  await setupUninstallUrl()

  // Watch for distinct_id changes and update URL accordingly
  storage.watch<DistinctId>(DISTINCT_ID_KEY, (distinctId) => {
    log.debug('distinct_id changed in storage, updating uninstall URL')
    // Pass the distinctId from the watcher to avoid redundant storage read
    setupUninstallUrl(distinctId).catch((error) => {
      log.error('Error updating uninstall URL after distinct_id change:', error)
    })
  })
}

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
  browser.runtime.onStartup.addListener(async () => {
    injectContentScriptToAllTabs()
    log.debug('Service worker is running')
  })
}
