import log from 'loglevel'
import { ANALYTICS_EVENTS, trackEvent } from '../core/analytics'
import { saveEnvironmentToStorage } from '../core/environment'
import { initializeStorage } from '../core/storage'
import {
  ExportResult,
  Message,
  MESSAGE_TYPES,
  ScrapedData,
  SidePanelConfig,
  TrackEventPayload,
} from '../core/types'
import { isInjectableUrl } from '../lib/isInjectableUrl'
log.setDefaultLevel('error')

// On startup, set log level from storage
chrome.storage.sync.get(['debugMode'], (result) => {
  log.setLevel(result.debugMode ? 'trace' : 'error')
})

// Listen for debugMode changes in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.debugMode) {
    log.setLevel(changes.debugMode.newValue ? 'trace' : 'error')
  }
})

// Helper to generate session storage key for a tab
const getSessionKey = (tabId: number): string => `sidepanel_config_${tabId}`

// Inject content script into all eligible tabs
const injectContentScriptToAllTabs = async () => {
  // Get all tabs
  const tabs = await chrome.tabs.query({})

  // Get content scripts from manifest
  const contentScripts = chrome.runtime.getManifest().content_scripts
  if (!contentScripts?.length) return

  // Get injectable tabs and script files
  const injectableTabs = tabs.filter((tab) => tab.id && isInjectableUrl(tab.url))
  const scriptFiles = contentScripts
    .filter((script) => script.js?.length)
    .flatMap((script) => script.js as string[])

  // Inject scripts into each eligible tab
  for (const tab of injectableTabs) {
    for (const file of scriptFiles) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          files: [file],
        })
      } catch (error) {
        // Ignore errors for restricted pages
        log.warn(
          `Failed to inject content script into tab ${tab.id} with url ${tab.url}:`,
          (error as typeof chrome.runtime.lastError)?.message,
        )
      }
    }
  }
}

// Initialize extension when installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  log.debug('Scrape Similar extension installed')

  // Save environment to storage on install/update
  await saveEnvironmentToStorage()

  // Initialize storage
  await initializeStorage()

  // Set storage.session access level to allow content scripts access
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    log.debug('Set storage.session access level to allow content scripts access')
  } catch (error) {
    log.error('Error setting storage.session access level:', error)
  }

  // Create context menu item
  chrome.contextMenus.create(
    {
      id: 'scrape-similar',
      title: 'Scrape similar elements',
      contexts: ['selection', 'page', 'link', 'image'],
    },
    () => {
      // Check for any errors when creating context menu
      if (chrome.runtime.lastError) {
        log.error('Error creating context menu:', chrome.runtime.lastError)
      } else {
        log.debug('Context menu created successfully')
      }
    },
  )

  // Set side panel behavior - make the action icon open/close the sidepanel
  try {
    // Removed cast, use standard API
    await chrome.sidePanel.setPanelBehavior({
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
  trackEvent(ANALYTICS_EVENTS.EXTENSION_INSTALLED, {
    extension_version: chrome.runtime.getManifest().version,
  })
})

// Inject content script into all tabs on browser startup (extension enabled)
chrome.runtime.onStartup.addListener(() => {
  injectContentScriptToAllTabs()

  log.debug('Service worker is running')
})

// Handle action button clicks to toggle sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return
  const tabId = tab.id

  log.debug(`Action clicked for tab: ${tabId}`)
  try {
    // Ensure the panel is enabled and configured for this tab before the browser automatically opens it
    await chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html`,
      enabled: true,
    })
    log.debug(`Side panel options set for tab ${tabId} via action click`)

    // Track side panel opened via action click
    trackEvent(ANALYTICS_EVENTS.SIDE_PANEL_OPENED, {
      trigger: 'action_click',
    })

    // --- Ensure a session state exists for this tab ---
    try {
      const sessionKey = getSessionKey(tabId)
      const result = await chrome.storage.session.get(sessionKey)
      // Only save default state if NO config exists yet for this tab
      if (!result[sessionKey]) {
        const defaultPanelState: Partial<SidePanelConfig> = {
          initialSelectionText: undefined,
          elementDetails: undefined,
          selectionOptions: undefined,
          currentScrapeConfig: undefined, // Start with no specific config
        }
        log.debug(`[ActionClick] No session state found for tab ${tabId}. Saving default state.`)
        await chrome.storage.session.set({ [sessionKey]: defaultPanelState })
      } else {
        log.debug(`[ActionClick] Session state already exists for tab ${tabId}. Not overwriting.`)
      }
    } catch (error) {
      log.error(`[ActionClick] Error ensuring session state for tab ${tabId}:`, error)
    }
    // -------------------------------------------------

    // The panel should open automatically due to openPanelOnActionClick: true
    // Do NOT explicitly call open() here as it conflicts with the user gesture requirement when await is used for setOptions
    // await chrome.sidePanel.open({ tabId });
  } catch (error) {
    log.error(`Error handling action click for tab ${tabId}:`, error)
  }
})

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  log.debug('Context menu clicked:', info, tab)

  if (!tab?.id) {
    log.error('No tab ID available')
    return
  }
  const targetTabId = tab.id

  if (info.menuItemId === 'scrape-similar') {
    log.debug('Scrape similar selected, opening side panel and triggering element details save...')

    // Always open the side panel (safe even if already open)
    try {
      await chrome.sidePanel.open({ tabId: targetTabId })
      log.debug(`Side panel opened for tab ${targetTabId}`)
    } catch (error) {
      log.error(`Error opening side panel for tab ${targetTabId}:`, error)
    }

    // Tell content script to save element details to storage, then trigger highlight, then scrape
    try {
      const saveResp = await chrome.tabs.sendMessage(targetTabId, {
        type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE,
      })
      if (!saveResp?.success)
        throw new Error('Failed to save element details: ' + (saveResp?.error || 'Unknown error'))
      log.debug('Told content script to save element details to storage.')

      // Fetch the latest config from session storage
      const sessionKey = getSessionKey(targetTabId)
      const result = await chrome.storage.session.get(sessionKey)
      const currentData = result[sessionKey] || {}
      const config = currentData.currentScrapeConfig
      if (config && config.mainSelector) {
        // Highlight elements before scraping
        const highlightResp = await chrome.tabs.sendMessage(targetTabId, {
          type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
          payload: { selector: config.mainSelector },
        })
        if (
          !highlightResp?.success ||
          typeof highlightResp.matchCount !== 'number' ||
          highlightResp.matchCount === 0
        ) {
          // Notify sidepanel of highlight result (even if failed)
          await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.HIGHLIGHT_RESULT_FROM_CONTEXT_MENU,
            payload: {
              tabId: targetTabId,
              matchCount: highlightResp.matchCount,
              error: highlightResp.error,
              success: highlightResp.success,
            },
          })
          log.warn('Highlight failed or no elements found for selector, aborting scrape.')
          return
        }
        // Notify sidepanel of highlight result (success)
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.HIGHLIGHT_RESULT_FROM_CONTEXT_MENU,
          payload: {
            tabId: targetTabId,
            matchCount: highlightResp.matchCount,
            error: highlightResp.error,
            success: highlightResp.success,
          },
        })
        // Send START_SCRAPE to content script
        const scrapeResp = await chrome.tabs.sendMessage(targetTabId, {
          type: MESSAGE_TYPES.START_SCRAPE,
          payload: config,
        })
        if (!scrapeResp?.success)
          throw new Error('Failed to trigger scrape: ' + (scrapeResp?.error || 'Unknown error'))
        log.debug('Scrape triggered successfully.')

        // Track successful scrape initiation from context menu
        trackEvent(ANALYTICS_EVENTS.SCRAPE_INITIATED_FROM_CONTEXT_MENU, {
          has_config: !!config,
        })
      } else {
        log.warn('No currentScrapeConfig found in session storage, cannot auto-scrape.')
      }
    } catch (error) {
      log.error('Error in right-click scrape flow:', error)
    }
  }
})

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  log.debug(`Tab removed: ${tabId}`)
  const sessionKey = getSessionKey(tabId)
  try {
    await chrome.storage.session.remove(sessionKey)
    log.debug(`Removed session data for tab ${tabId}`)
  } catch (error) {
    log.error(`Error removing session data for tab ${tabId}:`, error)
  }
})

// Handle messages from content scripts and UI
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  log.debug('Background received message:', message, 'from sender:', sender)

  // Handle messages from content script (always have sender.tab)
  if (sender.tab && sender.tab.id) {
    handleContentScriptMessage(message, sender, sendResponse)
  }
  // Handle messages from UI (side panel, popup - no sender.tab)
  else {
    handleUiMessage(message, sender, sendResponse)
  }

  // Return true to indicate async response possibility
  return true
})

// Handle messages from content script
const handleContentScriptMessage = async (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  const tabId = sender.tab?.id
  if (!tabId) {
    log.error('No tab ID available for content script message')
    return
  }

  log.debug(`Handling message from content script in tab ${tabId}:`, message)

  try {
    switch (message.type) {
      case MESSAGE_TYPES.GET_MY_TAB_ID: {
        // Simple handler to return the tab ID from the sender
        log.debug(`Content script in tab ${tabId} requested its own tab ID`)
        sendResponse({ tabId })
        break
      }

      case MESSAGE_TYPES.TRACK_EVENT: {
        // Handle tracking events from content scripts
        const { eventName, properties } = message.payload as TrackEventPayload
        if (eventName) {
          // Use the trackEvent function to handle the event in background context
          trackEvent(eventName, {
            ...properties,
          })
          log.debug(`Tracked event from content script in tab ${tabId}: ${eventName}`)
          sendResponse({ success: true })
        } else {
          log.warn(`Invalid tracking event from content script in tab ${tabId}:`, message)
          sendResponse({ success: false, error: 'Invalid event name' })
        }
        break
      }

      default:
        log.warn(`Unhandled content script message type for tab ${tabId}: ${message.type}`)
        sendResponse({ warning: 'Unhandled message type' })
    }
  } catch (error) {
    log.error(`Error handling content script message for tab ${tabId}:`, error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

// Handle messages from UI
const handleUiMessage = async (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
) => {
  switch (message.type) {
    case MESSAGE_TYPES.EXPORT_TO_SHEETS: {
      // Require filename in payload
      const { filename, scrapedData, columnOrder } = message?.payload as {
        filename: string
        scrapedData: ScrapedData
        columnOrder?: string[]
      }
      if (!filename.trim()) {
        sendResponse({ success: false, error: 'Filename is required for export' })
        return
      }
      if (!scrapedData || !Array.isArray(scrapedData) || scrapedData.length === 0) {
        sendResponse({ success: false, error: 'No data to export' })
        return
      }
      log.debug('Requesting export to sheets with filename:', filename)
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          log.error('Error getting auth token:', chrome.runtime.lastError)
          const errorMessage = chrome.runtime.lastError.message || 'Unknown OAuth error'
          sendResponse({
            success: false,
            error: errorMessage,
          })
          return
        }
        if (!token) {
          sendResponse({
            success: false,
            error: 'Failed to get authentication token',
          })
          return
        }
        try {
          const exportResult = await exportToGoogleSheets(
            token.toString(),
            scrapedData,
            filename,
            columnOrder,
          )
          sendResponse(exportResult)
        } catch (error) {
          const errorResult = {
            success: false,
            error: (error as Error).message,
          }
          sendResponse(errorResult)
        }
      })
      break
    }

    default:
      log.warn(`Unhandled UI message type: ${message.type}`)
      sendResponse({ warning: 'Unhandled message type' })
  }
}

// Export data to Google Sheets
const exportToGoogleSheets = async (
  token: string,
  scrapedData: ScrapedData,
  filename: string,
  columnOrder?: string[],
): Promise<ExportResult> => {
  try {
    if (!scrapedData || !scrapedData.length) {
      return { success: false, error: 'No data to export' }
    }

    // Get column headers - use provided columnOrder if available, otherwise fallback to Object.keys
    const headers =
      columnOrder && columnOrder.length > 0 ? columnOrder : Object.keys(scrapedData[0].data)

    if (headers.length === 0) {
      return { success: false, error: 'No columns found in data' }
    }

    // Create sheet values (header row + data rows)
    const values = [
      headers,
      ...scrapedData.map((row) => headers.map((header) => row.data[header] || '')),
    ]

    // Helper function to make authenticated requests
    const makeRequest = async (url: string, options: RequestInit) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 401) {
        await chrome.identity.removeCachedAuthToken({ token })
        throw new Error('Authentication token expired')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`API request failed: ${response.statusText} ${JSON.stringify(errorData)}`)
      }

      return response.json()
    }

    // Create a new spreadsheet
    const spreadsheet = await makeRequest('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: filename,
        },
      }),
    })

    const spreadsheetId = spreadsheet.spreadsheetId
    const spreadsheetUrl = spreadsheet.spreadsheetUrl

    // Get the sheet ID from the created spreadsheet
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Update values in the sheet first
    await makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        body: JSON.stringify({
          range: 'Sheet1!A1',
          majorDimension: 'ROWS',
          values,
        }),
      },
    )

    // Then format the header row and auto-resize using the correct sheet ID
    await makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                    textFormat: { bold: true },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        }),
      },
    )

    log.debug(`Successfully exported data to Google Sheet: ${spreadsheetUrl}`)
    return {
      success: true,
      url: spreadsheetUrl,
    }
  } catch (error) {
    log.error('Error exporting to Google Sheets:', error)

    if ((error as Error).message.includes('Authentication token expired')) {
      return {
        success: false,
        error: 'Authentication expired. Please try again.',
      }
    }

    return {
      success: false,
      error: (error as Error).message,
    }
  }
}
