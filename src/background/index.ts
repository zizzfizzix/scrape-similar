import {
  MESSAGE_TYPES,
  Message,
  ScrapedData,
  ScrapeConfig,
  SelectionOptions,
  SidePanelConfig,
  ElementDetailsPayload,
  ExportResult,
  Preset,
} from '../core/types'
import { getPresets, initializeStorage, savePreset, deletePreset } from '../core/storage'

console.log('background is running')

// Helper to generate session storage key for a tab
const getSessionKey = (tabId: number): string => `sidepanel_config_${tabId}`

// Initialize extension when installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Modern Scraper extension installed')

  // Initialize storage
  await initializeStorage()

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
    // Cast to any as TypeScript definitions might be outdated - Removed cast, use standard API
    // await chrome.sidePanel.setPanelBehavior({
    //   openPanelOnActionClick: true,
    // })
    console.log('Side panel behavior set successfully - action icon will now toggle the panel')
  } catch (error) {
    console.error('Error setting side panel behavior:', error)
  }
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
      path: `sidepanel.html?tabId=${tabId}`, // Pass tabId for context
      enabled: true
    })
    console.log(`Side panel options set for tab ${tabId} via action click`)

    // --- Ensure a session state exists for this tab ---
    try {
      const sessionKey = getSessionKey(tabId);
      const result = await chrome.storage.session.get(sessionKey);
      // Only save default state if NO config exists yet for this tab
      if (!result[sessionKey]) {
        const defaultPanelState: Partial<SidePanelConfig> = {
          initialSelectionText: undefined,
          elementDetails: undefined,
          selectionOptions: undefined,
          currentScrapeConfig: undefined, // Start with no specific config
        };
        console.log(`[ActionClick] No session state found for tab ${tabId}. Saving default state.`);
        await chrome.storage.session.set({ [sessionKey]: defaultPanelState });
      } else {
        console.log(`[ActionClick] Session state already exists for tab ${tabId}. Not overwriting.`);
      }
    } catch (error) {
      console.error(`[ActionClick] Error ensuring session state for tab ${tabId}:`, error);
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
    console.log('Scrape similar selected, initiating side panel open process...')

    // --- Step 1: Open Side Panel Immediately (satisfies user gesture) ---
    try {
      // No await here, let it open in the background while we fetch data
      chrome.sidePanel.open({ tabId: targetTabId });
      console.log(`Side panel open initiated synchronously for tab ${targetTabId} via context menu.`);
    } catch (error) {
      console.error(`Error initiating synchronous side panel open for tab ${targetTabId}:`, error);
      // If opening fails immediately, stop the process.
      return; 
    }
    // --------------------------------------------------------------------

    // --- Step 2: Request element details from content script asynchronously ---
    let fetchedElementDetails: ElementDetailsPayload = null;
    try {
      // Now we can safely await the details
      const response = await chrome.tabs.sendMessage(targetTabId, {
        type: MESSAGE_TYPES.REQUEST_CACHED_ELEMENT_DETAILS
      });
      if (response?.success && response.payload) {
        fetchedElementDetails = response.payload;
        console.log(`[ContextMenu] Received element details from content script:`, fetchedElementDetails);
      } else {
        console.warn(`[ContextMenu] Content script did not return element details. Error: ${response?.error}`);
      }
    } catch (error) {
      console.error(`[ContextMenu] Error requesting element details from content script for tab ${targetTabId}:`, error);
      // Proceed even without details, side panel will load with minimal state.
    }
    // -----------------------------------------------------------------------

    // --- Step 3: Save initial selection info (including fetched details) ---
    const sessionKey = getSessionKey(targetTabId)
    // Construct initial info using both context menu info and fetched details
    const initialSelectionInfo: Partial<SidePanelConfig> = {
      initialSelectionText: info.selectionText || fetchedElementDetails?.text || '', // Use fetched text if available
      elementDetails: fetchedElementDetails, // Store the full details
      selectionOptions: undefined, // Keep this undefined for now
    }

    try {
      // Get existing data if any
      const result = await chrome.storage.session.get(sessionKey)
      const existingData = result[sessionKey] || {}
      // Merge new initial data with existing data (if any)
      const updatedData = { ...existingData, ...initialSelectionInfo }

      console.log(`[ContextMenu] Attempting to save merged session state to key "${sessionKey}":`, updatedData);
      await chrome.storage.session.set({ [sessionKey]: updatedData })
      console.log(`[ContextMenu] Successfully saved merged session state for tab ${targetTabId}`)

      // --- Step 4: Configure/Enable panel (might be redundant if already open, but good practice) ---
      try {
          await chrome.sidePanel.setOptions({
              tabId: targetTabId,
              path: `sidepanel.html?tabId=${targetTabId}`, // Ensure correct path is set
              enabled: true
          });
          console.log(`Side panel configured/enabled for tab ${targetTabId} via context menu.`);
      } catch (error) {
          console.error(`Error setting side panel options for tab ${targetTabId} via context menu:`, error);
      }
      // --------------------------------------------------------------------------------------

    } catch (error) {
      console.error(
        `[ContextMenu] Error saving initial session data for tab ${targetTabId}:`,
        error,
      )
    }
  }
})

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId
  console.log(`Tab activated: ${tabId}`);
  // Removing all setOptions logic from here to see if default behavior works better
  /*
  const sessionKey = getSessionKey(tabId)

  try {
// ... existing code ...
  } catch (error) {
    console.error(`Error setting side panel options on tab activation for tab ${tabId}:`, error)
  }
  */
});

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

  // Handle content script loaded notification
  if (message.type === 'CONTENT_SCRIPT_LOADED') {
    console.log('Content script loaded notification received')
    sendResponse({ acknowledged: true })
    return true
  }

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
      case MESSAGE_TYPES.ELEMENT_DETAILS_READY: {
        const elementDetails = message.payload as ElementDetailsPayload | null
        console.log(`Received element details for tab ${tabId}:`, elementDetails)

        // Update session data instead
        currentData.elementDetails = elementDetails || undefined
        await chrome.storage.session.set({ [sessionKey]: currentData })
        console.log(`Updated element details in session for tab ${tabId}`)

        // Send updated data to the side panel for this tab
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.INITIAL_OPTIONS_DATA, // Use a specific type for sending full data
          payload: {
            tabId: tabId,
            config: currentData,
          },
        })
        sendResponse({ success: true })
        break
      }

      case MESSAGE_TYPES.SELECTION_OPTIONS_READY: {
        const selectionOptions = message.payload as SelectionOptions
        console.log(`Received selection options for tab ${tabId}:`, selectionOptions)

        // Update session data
        currentData.selectionOptions = selectionOptions
        await chrome.storage.session.set({ [sessionKey]: currentData })
        console.log(`Updated selection options in session for tab ${tabId}`)

        // Send updated data to the side panel for this tab
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.INITIAL_OPTIONS_DATA, // Use a specific type for sending full data
          payload: {
            tabId: tabId,
            config: currentData,
          },
        })
        sendResponse({ success: true })
        // Removed old logic that only sent options
        break
      }

      case MESSAGE_TYPES.SCRAPE_DATA_READY:
        // Forward scraped data to UI (could potentially target specific panel instance later)
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.SCRAPE_DATA_UPDATE,
          payload: message.payload as ScrapedData,
        })
        sendResponse({ success: true })
        break

      case MESSAGE_TYPES.CONTENT_SCRIPT_ERROR:
        console.error(`Content script error in tab ${tabId}:`, message.payload)
        sendResponse({ success: false, error: message.payload })
        break

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
    case MESSAGE_TYPES.REQUEST_SIDEPANEL_TAB_ID: {
      // Use async/await to get the active tab
      (async () => {
        try {
          let queryOptions = { active: true, lastFocusedWindow: true };
          let [tab] = await chrome.tabs.query(queryOptions);

          if (tab && tab.id) {
            const activeTabId = tab.id;
            console.log(`Responding to REQUEST_SIDEPANEL_TAB_ID with active tabId: ${activeTabId}`);
            sendResponse({ tabId: activeTabId }); // Send tabId back
          } else {
            console.error('Could not find active tab in last focused window.');
            sendResponse({ error: 'Could not find active tab' });
          }
        } catch (error) {
           console.error('Error querying for active tab:', error);
           sendResponse({ error: 'Could not determine active tab' });
        }
      })(); // Immediately invoke the async function
      
      return true; // Indicate async response is expected
    }

    case MESSAGE_TYPES.REQUEST_SCRAPE: {
      const { tabId, config } = message.payload as { tabId: number; config: ScrapeConfig }

      // Send message to content script to start scraping
      chrome.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })
      break
    }

    case MESSAGE_TYPES.REQUEST_HIGHLIGHT: {
      const { tabId, selector, language } = message.payload as {
        tabId: number
        selector: string
        language: string
      }

      // Send message to content script to highlight elements
      chrome.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector, language },
      })
      break
    }

    case MESSAGE_TYPES.EXPORT_TO_SHEETS: {
      const data = message.payload as ScrapedData
      console.log('Requesting export to sheets')
      try {
        // Get auth token
        chrome.identity.getAuthToken({ interactive: true }, async (result) => {
          if (chrome.runtime.lastError || !result || !result.token) {
            const errorMsg =
              chrome.runtime.lastError?.message || 'Failed to get authentication token'
            console.error('Error getting auth token:', errorMsg)
            chrome.runtime.sendMessage({
              type: MESSAGE_TYPES.EXPORT_STATUS_UPDATE,
              payload: {
                success: false,
                error: errorMsg,
              },
            })
            return
          }

          const tokenString = result.token

          // Export to Google Sheets
          const exportResult = await exportToGoogleSheets(tokenString, data)

          // Send result back to UI
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.EXPORT_STATUS_UPDATE,
            payload: exportResult,
          })
          sendResponse(exportResult) // Respond to original message
        })
      } catch (error) {
        console.error('Error exporting to Google Sheets:', error)
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXPORT_STATUS_UPDATE,
          payload: {
            success: false,
            error: (error as Error).message,
          },
        })
      }
      break
    }

    case MESSAGE_TYPES.SAVE_PRESET: {
      const preset = message.payload
      const success = await savePreset(preset)

      if (success) {
        const presets = await getPresets()
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.PRESETS_UPDATED,
          payload: presets,
        })
      }
      break
    }

    case MESSAGE_TYPES.LOAD_PRESETS: {
      const presets = await getPresets()
      sendResponse(presets)
      break
    }

    case MESSAGE_TYPES.DELETE_PRESET: {
      const presetId = message.payload
      const success = await deletePreset(presetId)

      if (success) {
        const presets = await getPresets()
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.PRESETS_UPDATED,
          payload: presets,
        })
      }
      break
    }

    case MESSAGE_TYPES.SIDEPANEL_LOADED: {
      const { tabId } = message.payload as { tabId: number }
      if (!tabId) {
        console.error('SIDEPANEL_LOADED message received without tabId')
        sendResponse({ error: 'Missing tabId in payload' })
        return
      }
      console.log(`Side panel loaded for tab ${tabId}`)
      const sessionKey = getSessionKey(tabId)
      try {
        const result = await chrome.storage.session.get(sessionKey)
        const config = result[sessionKey] || {}
        console.log(`Sending initial config data to side panel for tab ${tabId}`, config)
        // Send the stored config back to the specific side panel instance
        // Use sendResponse to reply directly to the sender (the specific side panel instance)
        sendResponse({
          type: MESSAGE_TYPES.INITIAL_OPTIONS_DATA,
          payload: {
            tabId: tabId,
            config: config,
          },
        })
      } catch (error) {
        console.error(`Error retrieving session data for tab ${tabId} on load:`, error)
        sendResponse({ success: false, error: (error as Error).message })
      }
      // Return true because sendResponse is called asynchronously within the try/catch
      return true
    }

    case MESSAGE_TYPES.UPDATE_PANEL_CONFIG: {
      const { tabId, config } = message.payload as {
        tabId: number
        config: Partial<SidePanelConfig>
      }
      if (!tabId) {
        console.error('UPDATE_PANEL_CONFIG message received without tabId')
        sendResponse({ error: 'Missing tabId in payload' })
        return
      }
      console.log(`Updating panel config for tab ${tabId}:`, config)
      const sessionKey = getSessionKey(tabId)
      try {
        const result = await chrome.storage.session.get(sessionKey)
        const currentData = result[sessionKey] || {}
        const updatedData = { ...currentData, ...config } // Merge changes

        // Add logging before set
        console.log(`[UI Update] Attempting to save to session key "${sessionKey}":`, updatedData);
        await chrome.storage.session.set({ [sessionKey]: updatedData })
        // Add logging after set
        console.log(`[UI Update] Successfully updated session config for tab ${tabId}`)
        sendResponse({ success: true })
      } catch (error) {
        console.error(`[UI Update] Error updating session config for tab ${tabId}:`, error) // Added context tag
        sendResponse({ success: false, error: (error as Error).message })
      }
      // Return true because the response is async (await)
      return true
    }

    default:
      console.warn(`Unhandled UI message type: ${message.type}`)
      sendResponse({ warning: 'Unhandled message type' })
  }
  // Default return true if not handled by specific async cases above
  // This might be needed if some UI messages expect an async response later
  // return true; // Removed - return true only when needed for async responses
}

// Export data to Google Sheets
const exportToGoogleSheets = async (token: string, data: ScrapedData): Promise<ExportResult> => {
  // Updated return type
  try {
    if (!data || !data.length) {
      // Added null check for data
      return { success: false, error: 'No data to export' }
    }

    // Get column headers from first row
    const headers = Object.keys(data[0])

    // Create sheet values (header row + data rows)
    const values = [headers, ...data.map((row) => headers.map((header) => row[header] || ''))]

    // Create a new spreadsheet
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `Modern Scraper Export - ${new Date().toLocaleString()}`, // More descriptive title
        },
        // No need to predefine sheets if we append
      }),
    })

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({})) // Try to get error details
      console.error(
        'Failed to create spreadsheet:',
        createResponse.status,
        createResponse.statusText,
        errorData,
      )
      throw new Error(
        `Failed to create spreadsheet: ${createResponse.statusText} ${JSON.stringify(errorData)}`,
      )
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const spreadsheetUrl = spreadsheet.spreadsheetUrl

    // Update values in the sheet
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: 'Sheet1!A1', // Required for append body, though redundant with URL
          majorDimension: 'ROWS',
          values,
        }),
      },
    )

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({})) // Try to get error details
      console.error(
        'Failed to update spreadsheet:',
        updateResponse.status,
        updateResponse.statusText,
        errorData,
      )
      throw new Error(
        `Failed to update spreadsheet: ${updateResponse.statusText} ${JSON.stringify(errorData)}`,
      )
    }

    console.log(`Successfully exported data to Google Sheet: ${spreadsheetUrl}`)
    return {
      success: true,
      url: spreadsheetUrl,
    }
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error)
    return {
      success: false,
      error: (error as Error).message,
    }
  }
}

// // Ensure the side panel is enabled and open for a specific tab
// const openSidePanel = async (tabId: number) => {
//   console.log(`Ensuring side panel is open for tab: ${tabId}`)
//   try {
//     // First, ensure it's enabled and has the correct path for this tab
//     await chrome.sidePanel.setOptions({
//       tabId,
//       path: `sidepanel.html?tabId=${tabId}`, // Pass tabId for context
//       enabled: true,
//     })
//     console.log(`Side panel options set for tab ${tabId}`)

//     // Then, explicitly open it for this tab
//     await chrome.sidePanel.open({ tabId })
//     console.log(`Side panel explicitly opened for tab ${tabId}`)
//   } catch (error) {
//     console.error(`Error opening side panel for tab ${tabId}:`, error)
//     // Consider if fallback is still needed/desired
//     // openInFallbackTab(tabId);
//   }
// }
