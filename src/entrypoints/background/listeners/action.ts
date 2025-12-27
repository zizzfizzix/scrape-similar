import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import log from 'loglevel'
import { initializeSessionState } from '../services/session-storage'

/**
 * Handle action button clicks to toggle sidepanel
 */
export const setupActionListener = (): void => {
  browser.action.onClicked.addListener(async (tab: Browser.tabs.Tab) => {
    if (!tab?.id) return
    const tabId = tab.id

    log.debug(`Action clicked for tab: ${tabId}`)
    try {
      // Ensure the panel is enabled and configured for this tab before the browser automatically opens it
      await browser.sidePanel.setOptions({
        tabId,
        path: `sidepanel.html`,
        enabled: true,
      })
      log.debug(`Side panel options set for tab ${tabId} via action click`)

      // Track side panel opened via action click
      trackEvent(ANALYTICS_EVENTS.SIDE_PANEL_OPEN, {
        trigger: 'action_click',
      })

      // Ensure a session state exists for this tab
      try {
        await initializeSessionState(tabId)
      } catch (error) {
        log.error(`[ActionClick] Error ensuring session state for tab ${tabId}:`, error)
      }

      // The panel should open automatically due to openPanelOnActionClick: true
      // Do NOT explicitly call open() here as it conflicts with the user gesture requirement when await is used for setOptions
    } catch (error) {
      log.error(`Error handling action click for tab ${tabId}:`, error)
    }
  })
}
