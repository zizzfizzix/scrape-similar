import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'
import { PostHog } from 'posthog-js/dist/module.no-external'

log.setDefaultLevel('error')

export default defineBackground(() => {
  // Always log at trace level in development or test mode
  if (isDevOrTest) {
    log.setLevel('trace')
  } else {
    // Initialise log level from persistent storage
    storage.getItem<boolean>('local:debugMode').then((debugMode) => {
      log.setLevel(debugMode ? 'trace' : 'error')
    })
  }

  // Broadcast debugMode changes to all tabs
  const broadcastDebugMode = async (debugValue: boolean) => {
    try {
      const tabs = await browser.tabs.query({})
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs
            .sendMessage(tab.id, {
              type: MESSAGE_TYPES.DEBUG_MODE_CHANGED,
              payload: { debugMode: debugValue },
            })
            .catch(() => {
              /* ignore errors for tabs without listener */
            })
        }
      }
    } catch (error) {
      log.warn('Error broadcasting debugMode change:', error)
    }
  }

  // React to debugMode changes
  storage.watch<boolean>('local:debugMode', (debugMode) => {
    if (!isDevOrTest) {
      log.setLevel(debugMode ? 'trace' : 'error')
    }
    broadcastDebugMode(!!debugMode)
  })

  // Helper to generate session storage key for a tab
  const getSessionKey = (tabId: number): string => `sidepanel_config_${tabId}`

  // Helper to atomically merge updates into a tab's session blob
  const applySidePanelDataUpdates = async (
    tabId: number,
    updates: Partial<SidePanelConfig>,
  ): Promise<void> => {
    const sessionKey = getSessionKey(tabId)
    const mutex = getStorageMutex(sessionKey)
    await mutex.runExclusive(async () => {
      const current = (await storage.getItem<SidePanelConfig>(`session:${sessionKey}`)) || {}
      const next: SidePanelConfig = { ...current, ...updates }
      await storage.setItem(`session:${sessionKey}`, next)
    })
  }

  // Inject content script into all eligible tabs
  const injectContentScriptToAllTabs = async () => {
    // Get all tabs
    const tabs = await browser.tabs.query({})

    // Get content scripts from manifest
    const contentScripts = browser.runtime.getManifest().content_scripts
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

  // Initialize extension when installed or updated
  browser.runtime.onInstalled.addListener(async (details) => {
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

    // Create context menu item
    browser.contextMenus.create(
      {
        id: 'scrape-similar',
        title: 'Scrape similar elements',
        contexts: ['selection', 'page', 'link', 'image'],
        documentUrlPatterns: [
          'http://*/*',
          'https://*/*',
          `chrome-extension://${browser.runtime.id}/onboarding.html`,
        ],
      },
      () => {
        // Check for any errors when creating context menu
        if (browser.runtime.lastError) {
          log.error('Error creating context menu:', browser.runtime.lastError)
        } else {
          log.debug('Context menu created successfully')
        }
      },
    )

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
    trackEvent(ANALYTICS_EVENTS.EXTENSION_INSTALLATION, {
      extension_version: browser.runtime.getManifest().version,
    })
  })

  // Inject content script into all tabs on browser startup (extension enabled)
  browser.runtime.onStartup.addListener(() => {
    injectContentScriptToAllTabs()

    log.debug('Service worker is running')
  })

  // Handle action button clicks to toggle sidepanel
  browser.action.onClicked.addListener(async (tab) => {
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

      // --- Ensure a session state exists for this tab ---
      try {
        const sessionKey = getSessionKey(tabId)
        const mutex = getStorageMutex(sessionKey)
        const existing = await mutex.runExclusive(async () =>
          storage.getItem<Partial<SidePanelConfig>>(`session:${sessionKey}`),
        )
        if (!existing) {
          const defaultPanelState: Partial<SidePanelConfig> = {
            initialSelectionText: undefined,
            elementDetails: undefined,
            selectionOptions: undefined,
            currentScrapeConfig: undefined,
          }
          log.debug(`[ActionClick] No session state found for tab ${tabId}. Saving default state.`)
          await mutex.runExclusive(async () => {
            await storage.setItem(`session:${sessionKey}`, defaultPanelState)
          })
        } else {
          log.debug(`[ActionClick] Session state already exists for tab ${tabId}. Not overwriting.`)
        }
      } catch (error) {
        log.error(`[ActionClick] Error ensuring session state for tab ${tabId}:`, error)
      }
      // -------------------------------------------------

      // The panel should open automatically due to openPanelOnActionClick: true
      // Do NOT explicitly call open() here as it conflicts with the user gesture requirement when await is used for setOptions
      // await browser.sidePanel.open({ tabId });
    } catch (error) {
      log.error(`Error handling action click for tab ${tabId}:`, error)
    }
  })

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    log.debug('Context menu clicked:', info, tab)

    if (!tab?.id) {
      log.error('No tab ID available')
      return
    }
    const targetTabId = tab.id

    if (info.menuItemId === 'scrape-similar') {
      log.debug(
        'Scrape similar selected, opening side panel and triggering element details save...',
      )

      // Always open the side panel (safe even if already open)
      try {
        await browser.sidePanel.open({ tabId: targetTabId })
        log.debug(`Side panel opened for tab ${targetTabId}`)
      } catch (error) {
        log.error(`Error opening side panel for tab ${targetTabId}:`, error)
      }

      // Tell content script to save element details to storage, then trigger highlight, then scrape
      try {
        const saveResp = await browser.tabs.sendMessage(targetTabId, {
          type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE,
        })
        if (!saveResp?.success)
          throw new Error('Failed to save element details: ' + (saveResp?.error || 'Unknown error'))
        log.debug('Told content script to save element details to storage.')

        // Fetch the latest config from session storage
        const sessionKey = getSessionKey(targetTabId)
        const mutex = getStorageMutex(sessionKey)
        const currentData =
          (await mutex.runExclusive(async () =>
            storage.getItem<SidePanelConfig>(`session:${sessionKey}`),
          )) || {}
        const config = currentData.currentScrapeConfig
        if (config && config.mainSelector) {
          // Highlight elements before scraping
          const highlightResp = await browser.tabs.sendMessage(targetTabId, {
            type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
            payload: { selector: config.mainSelector },
          })
          // Store highlight result in session storage immediately
          await applySidePanelDataUpdates(targetTabId, {
            highlightMatchCount: highlightResp.matchCount,
            highlightError: highlightResp.error,
          })
          if (
            !highlightResp?.success ||
            typeof highlightResp.matchCount !== 'number' ||
            highlightResp.matchCount === 0
          ) {
            log.warn('Highlight failed or no elements found for selector, aborting scrape.')
            return
          }
          // Send START_SCRAPE to content script
          const scrapeResp = await browser.tabs.sendMessage(targetTabId, {
            type: MESSAGE_TYPES.START_SCRAPE,
            payload: config,
          })
          if (!scrapeResp?.success)
            throw new Error('Failed to trigger scrape: ' + (scrapeResp?.error || 'Unknown error'))
          log.debug('Scrape triggered successfully.')

          // Track successful scrape initiation from context menu
          trackEvent(ANALYTICS_EVENTS.SCRAPE_INITIATION_FROM_CONTEXT_MENU, {
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
  browser.tabs.onRemoved.addListener(async (tabId) => {
    log.debug(`Tab removed: ${tabId}`)
    const sessionKey = getSessionKey(tabId)
    try {
      await storage.removeItem(`session:${sessionKey}`)
      log.debug(`Removed session data for tab ${tabId}`)
    } catch (error) {
      log.error(`Error removing session data for tab ${tabId}:`, error)
    }
  })

  // Handle messages from content scripts and UI
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    log.debug('Background received message:', message, 'from sender:', sender)

    // Handle UPDATE_SIDEPANEL_DATA universally before delegating
    if (message.type === MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA) {
      const { tabId: explicitTabId, updates } = (message.payload ?? {}) as {
        tabId?: number
        updates: Partial<SidePanelConfig>
      }
      const targetId = explicitTabId ?? sender.tab?.id
      if (typeof targetId !== 'number' || !updates) {
        sendResponse({ success: false, error: 'tabId or sender.tab.id required' })
        return true
      }
      applySidePanelDataUpdates(targetId, updates)
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          log.error('Error updating sidepanel state:', error)
          sendResponse({ success: false, error: (error as Error).message })
        })
      return true // handled
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
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
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
          log.debug(`Content script in tab ${tabId} requested its own tab ID`)
          sendResponse({ success: true, tabId })
          break
        }
        case MESSAGE_TYPES.TRACK_EVENT: {
          const { eventName, properties } = message.payload as TrackEventPayload
          if (eventName) {
            trackEvent(eventName, { ...properties })
            log.debug(`Tracked event from content script in tab ${tabId}: ${eventName}`)
            sendResponse({ success: true })
          } else {
            log.warn(`Invalid tracking event from content script in tab ${tabId}:`, message)
            sendResponse({ success: false, error: 'Invalid event name' })
          }
          break
        }
        case MESSAGE_TYPES.GET_DEBUG_MODE: {
          log.debug(`Content script in tab ${tabId} requested debug mode status`)
          const debugSetting = await storage.getItem<boolean>('local:debugMode')
          sendResponse({ success: true, debugMode: !!debugSetting })
          break
        }
        default:
          log.warn(`Unhandled content script message type for tab ${tabId}: ${message.type}`)
          sendResponse({ success: false, warning: 'Unhandled message type' })
      }
    } catch (error) {
      log.error(`Error handling content script message for tab ${tabId}:`, error)
      sendResponse({ success: false, error: (error as Error).message })
    }
  }

  // Handle messages from UI
  const handleUiMessage = async (
    message: Message,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    switch (message.type) {
      case MESSAGE_TYPES.EXPORT_TO_SHEETS: {
        // Require filename in payload
        const { filename, scrapedData, columnOrder, columnKeys } = message?.payload as {
          filename: string
          scrapedData: ScrapedData
          columnOrder?: string[]
          columnKeys?: string[]
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
        browser.identity.getAuthToken({ interactive: true }, async (token) => {
          if (browser.runtime.lastError) {
            log.error('Error getting auth token:', browser.runtime.lastError)
            const errorMessage = browser.runtime.lastError.message || 'Unknown OAuth error'
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
              columnKeys,
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
    columnKeys?: string[],
  ): Promise<ExportResult> => {
    try {
      if (!scrapedData || !scrapedData.length) {
        return { success: false, error: 'No data to export' }
      }

      // Get column headers - use columnOrder if available, otherwise fallback to Object.keys
      const headers =
        columnOrder && columnOrder.length > 0 ? columnOrder : Object.keys(scrapedData[0].data)

      if (headers.length === 0) {
        return { success: false, error: 'No columns found in data' }
      }

      // Use columnKeys for data access if available, otherwise use headers
      const dataKeys = columnKeys && columnKeys.length > 0 ? columnKeys : headers

      // Create sheet values (header row + data rows)
      const values = [
        headers,
        ...scrapedData.map((row) => dataKeys.map((key) => row.data[key] || '')),
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
          await browser.identity.removeCachedAuthToken({ token })
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

  // Flush any queued events that were captured before consent
  const flushQueuedEvents = async () => {
    return queueMutex.runExclusive(async () => {
      try {
        const queue =
          (await storage.getItem<QueuedEvent[]>(`local:${EVENT_QUEUE_STORAGE_KEY}`)) || []

        if (queue.length === 0) {
          log.debug('No queued events to flush')
          return
        }

        const ph = await getPostHogBackground()
        if (!ph) {
          log.warn('PostHog not initialized when trying to flush queue')
          return
        }

        // Set rate limiting to match the queue length temporarily so PostHog doesn't drop events
        ph.set_config({
          rate_limiting: {
            events_per_second: queue.length,
            events_burst_limit: queue.length * 10,
          },
        })

        log.debug(`Flushing ${queue.length} queued events...`)

        // Process events sequentially to avoid overwhelming PostHog
        for (const event of queue) {
          try {
            ph.capture(
              event.name,
              {
                ...event.props,
                buffered: true,
              },
              {
                timestamp: new Date(event.timestamp),
              },
            )
          } catch (error) {
            log.error(`Failed to capture buffered event: ${event.name}`, error)
            // Continue processing other events
          }
        }

        // Reset rate limiting to default
        ph.set_config({
          rate_limiting: {
            events_per_second: 10,
            events_burst_limit: 10 * 10,
          },
        })

        // Clear the queue after successful processing
        await storage.setItem(`local:${EVENT_QUEUE_STORAGE_KEY}`, [])
        log.debug(`Successfully flushed ${queue.length} buffered analytics events`)
      } catch (error) {
        const ph = await getPostHogBackground()

        if (ph && ph instanceof PostHog) {
          ph.set_config({
            rate_limiting: {
              events_per_second: 10,
              events_burst_limit: 10 * 10,
            },
          })
        }

        log.error('Error flushing queued events:', error)
      }
    })
  }

  // On background startup – attempt to init PostHog (if consent) and flush queue
  getPostHogBackground().then(flushQueuedEvents)

  // Listen for consent changes to (re)initialize PostHog and flush queued events
  storage.watch<boolean | null | string>(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, (value) => {
    const sanitizedConsentState =
      value === '' || value === null || value === undefined ? undefined : !!value
    if (sanitizedConsentState === true) {
      // Consent granted - initialize PostHog and flush queue
      getPostHogBackground().then(flushQueuedEvents)
    } else if (sanitizedConsentState === false) {
      // Consent declined - reset PostHog instance and clear the queue safely
      resetPostHogInstance()

      // Acquire the same mutex used by queueEvent / flushQueuedEvents to avoid races
      queueMutex.runExclusive(async () => {
        await storage.setItem(`local:${EVENT_QUEUE_STORAGE_KEY}`, [])
      })

      log.debug('User declined consent - reset PostHog and cleared event queue')
    }
  })

  // Watch for new items added to the analytics queue in case consent was granted after startup
  storage.watch<QueuedEvent[]>(`local:${EVENT_QUEUE_STORAGE_KEY}`, (queue) => {
    if (queue && queue.length > 0) {
      flushQueuedEvents()
    }
  })
})
