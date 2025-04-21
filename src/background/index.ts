import { initializeStorage } from '../core/storage'
import { ExportResult, Message, MESSAGE_TYPES, ScrapedData, SidePanelConfig } from '../core/types'
import { isInjectableUrl } from '../lib/isInjectableUrl'

console.log('background is running')

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
        console.warn(
          `Failed to inject content script into tab ${tab.id} with url ${tab.url}:`,
          (error as chrome.runtime.LastError).message,
        )
      }
    }
  }
}

// Initialize extension when installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Modern Scraper extension installed')

  // Initialize storage
  await initializeStorage()

  // Set storage.session access level to allow content scripts access
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    console.log('Set storage.session access level to allow content scripts access')
  } catch (error) {
    console.error('Error setting storage.session access level:', error)
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
        console.error('Error creating context menu:', chrome.runtime.lastError)
      } else {
        console.log('Context menu created successfully')
      }
    },
  )

  // Set side panel behavior - make the action icon open/close the sidepanel
  try {
    // Removed cast, use standard API
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    })
    console.log('Side panel behavior set successfully - action icon will now toggle the panel')
  } catch (error) {
    console.error('Error setting side panel behavior:', error)
  }

  // Inject content script into all tabs on install/update
  injectContentScriptToAllTabs()
})

// Inject content script into all tabs on browser startup (extension enabled)
chrome.runtime.onStartup.addListener(() => {
  injectContentScriptToAllTabs()
})

// Handle action button clicks to toggle sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return
  const tabId = tab.id

  console.log(`Action clicked for tab: ${tabId}`)
  try {
    // Ensure the panel is enabled and configured for this tab before the browser automatically opens it
    await chrome.sidePanel.setOptions({
      tabId,
      path: `sidepanel.html`,
      enabled: true,
    })
    console.log(`Side panel options set for tab ${tabId} via action click`)

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
        console.log(`[ActionClick] No session state found for tab ${tabId}. Saving default state.`)
        await chrome.storage.session.set({ [sessionKey]: defaultPanelState })
      } else {
        console.log(`[ActionClick] Session state already exists for tab ${tabId}. Not overwriting.`)
      }
    } catch (error) {
      console.error(`[ActionClick] Error ensuring session state for tab ${tabId}:`, error)
    }
    // -------------------------------------------------

    // The panel should open automatically due to openPanelOnActionClick: true
    // Do NOT explicitly call open() here as it conflicts with the user gesture requirement when await is used for setOptions
    // await chrome.sidePanel.open({ tabId });
  } catch (error) {
    console.error(`Error handling action click for tab ${tabId}:`, error)
  }
})

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info, tab)

  if (!tab?.id) {
    console.error('No tab ID available')
    return
  }
  const targetTabId = tab.id

  if (info.menuItemId === 'scrape-similar') {
    console.log(
      'Scrape similar selected, opening side panel and triggering element details save...',
    )

    // Always open the side panel (safe even if already open)
    try {
      await chrome.sidePanel.open({ tabId: targetTabId })
      console.log(`Side panel opened for tab ${targetTabId}`)
    } catch (error) {
      console.error(`Error opening side panel for tab ${targetTabId}:`, error)
    }

    // Tell content script to save element details to storage
    try {
      await chrome.tabs.sendMessage(targetTabId, {
        type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE,
      })
      console.log('Told content script to save element details to storage.')
    } catch (error) {
      console.error('Error sending SAVE_ELEMENT_DETAILS_TO_STORAGE to content script:', error)
    }
  }
})

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  console.log(`Tab removed: ${tabId}`)
  const sessionKey = getSessionKey(tabId)
  try {
    await chrome.storage.session.remove(sessionKey)
    console.log(`Removed session data for tab ${tabId}`)
  } catch (error) {
    console.error(`Error removing session data for tab ${tabId}:`, error)
  }
})

// Handle messages from content scripts and UI
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from sender:', sender)

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
    console.error('No tab ID available for content script message')
    return
  }

  console.log(`Handling message from content script in tab ${tabId}:`, message)

  const sessionKey = getSessionKey(tabId)

  try {
    // Always get current session data first
    const result = await chrome.storage.session.get(sessionKey)
    let currentData = (result[sessionKey] || {}) as Partial<SidePanelConfig>

    switch (message.type) {
      case 'GET_MY_TAB_ID': {
        // Simple handler to return the tab ID from the sender
        console.log(`Content script in tab ${tabId} requested its own tab ID`)
        sendResponse({ tabId })
        break
      }

      default:
        console.warn(`Unhandled content script message type for tab ${tabId}: ${message.type}`)
        sendResponse({ warning: 'Unhandled message type' })
    }
  } catch (error) {
    console.error(`Error handling content script message for tab ${tabId}:`, error)
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
      const { filename, scrapedData } = message?.payload as {
        filename: string
        scrapedData: ScrapedData
      }
      if (!filename) {
        sendResponse({ success: false, error: 'Filename is required for export' })
        return
      }
      if (!scrapedData || !Array.isArray(scrapedData) || scrapedData.length === 0) {
        sendResponse({ success: false, error: 'No data to export' })
        return
      }
      console.log('Requesting export to sheets with filename:', filename)
      chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting auth token:', chrome.runtime.lastError)
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
          const exportResult = await exportToGoogleSheets(token.toString(), scrapedData, filename)
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
      console.warn(`Unhandled UI message type: ${message.type}`)
      sendResponse({ warning: 'Unhandled message type' })
  }
}

// Export data to Google Sheets
const exportToGoogleSheets = async (
  token: string,
  data: ScrapedData,
  filename: string,
): Promise<ExportResult> => {
  try {
    if (!data || !data.length) {
      return { success: false, error: 'No data to export' }
    }

    // Get column headers from first row
    const headers = Object.keys(data[0])

    // Create sheet values (header row + data rows)
    const values = [headers, ...data.map((row) => headers.map((header) => row[header] || ''))]

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

    console.log(`Successfully exported data to Google Sheet: ${spreadsheetUrl}`)
    return {
      success: true,
      url: spreadsheetUrl,
    }
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error)

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
