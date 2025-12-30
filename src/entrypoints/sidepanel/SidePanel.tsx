import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { FEATURE_FLAGS, isFeatureEnabled } from '@/utils/feature-flags'
import { getScrapeJobForTab, liveGetScrapeResultForTab, promoteScrapeJob } from '@/utils/scrape-db'
import { chromeExtensionId } from '@@/package.json' with { type: 'json' }
import { useLiveQuery } from 'dexie-react-hooks'
import log from 'loglevel'
import { Minimize2, Save, X } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import slugify from 'slugify'
import { toast } from 'sonner'

// Simple splash screen component
const SplashScreen: React.FC<{ tabUrl: string }> = ({ tabUrl }) => (
  <div className="flex flex-1 items-center justify-center w-full min-w-0">
    <div className="flex flex-col items-center justify-center text-center w-full max-w-md mx-auto">
      <h2 className="text-2xl mb-4">Unsupported URL</h2>
      <p className="text-lg mb-2">
        For security reasons this extension can't work on{' '}
        <span className="italic">{getInjectableUrlPattern(tabUrl)}</span> pages.
      </p>
      <p className="text-lg mb-2">Try one of these websites:</p>
      <div className="flex flex-col items-left justify-between gap-2 h-full">
        <a href="https://www.wikipedia.org" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img src="/img/favicon-wikipedia.ico" alt="Wikipedia" className="w-4 h-4" /> Wikipedia
          </Card>
        </a>
        <a href="https://www.ourworldindata.org" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img
              src="/img/favicon-ourworldindata.ico"
              alt="Our World in Data"
              className="w-4 h-4"
            />{' '}
            Our World in Data
          </Card>
        </a>
        <a href="https://www.cia.gov/the-world-factbook/" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img
              src="/img/favicon-cia-world-factbook.webp"
              alt="CIA World Factbook"
              className="w-4 h-4"
            />{' '}
            CIA World Factbook
          </Card>
        </a>
        <a href="https://www.imdb.com" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img src="/img/favicon-imdb.png" alt="IMDb" className="w-4 h-4" /> IMDb
          </Card>
        </a>
      </div>
    </div>
  </div>
)

// Generic special view for when the side panel is viewing extension pages
const ExtensionPageControls: React.FC<{
  title: string
  currentTabUrl?: string
  currentTabId?: number | null
  showBackButton?: boolean
}> = ({ title, currentTabUrl, currentTabId, showBackButton = false }) => {
  // Handle going back to the original tab and close the current extension tab
  const handleBackToTab = async () => {
    if (!currentTabUrl || !showBackButton) return

    try {
      // Parse the URL to get the original tabId
      const url = new URL(currentTabUrl)
      const originalTabId = url.searchParams.get('tabId')

      if (originalTabId) {
        const tabId = Number(originalTabId)

        // Validate that the tab exists before trying to switch to it
        try {
          await browser.tabs.get(tabId)
          log.debug(`Tab ${tabId} exists, switching to it`)

          // Switch to the original tab
          await browser.tabs.update(tabId, { active: true })
          log.debug(`Switched back to tab ${tabId}`)

          // Close the current extension tab
          if (currentTabId) {
            await browser.tabs.remove(currentTabId)
            log.debug(`Closed extension tab ${currentTabId}`)
          }
        } catch (tabError) {
          toast.error('Target tab does not exist')
          log.error(`Tab ${tabId} does not exist:`, tabError)
        }
      } else {
        toast.error('No target tab ID found')
        log.error('No tabId parameter found in URL:', currentTabUrl)
      }
    } catch (err) {
      toast.error('Failed to switch back to tab')
      log.error('Error switching to tab:', err)
    }
  }

  // Handle closing the sidepanel
  const handleCloseSidePanel = async () => {
    try {
      // Close the sidepanel by closing the current window
      window.close()
    } catch (err) {
      toast.error('Failed to close sidepanel')
      log.error('Error closing sidepanel:', err)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-w-0">
      <div className="flex flex-col items-center justify-center text-center w-full max-w-md mx-auto gap-6">
        <h2 className="text-2xl mb-4">{title}</h2>

        <div className="flex flex-col gap-4">
          {showBackButton && (
            <Button onClick={handleBackToTab}>
              <Minimize2 className="h-4 w-4" />
              Compact View
            </Button>
          )}

          <Button onClick={handleCloseSidePanel} variant="outline" className="w-full">
            <X className="h-4 w-4" />
            Hide Sidepanel
          </Button>
        </div>
      </div>
    </div>
  )
}
interface SidePanelProps {
  debugMode: boolean
  onDebugModeChange: (enabled: boolean) => void
}

const SidePanel: React.FC<SidePanelProps> = ({ debugMode, onDebugModeChange }) => {
  // State
  const [targetTabId, setTargetTabId] = useState<number | null>(null)
  // Ref to hold the current targetTabId
  const targetTabIdRef = useRef<number | null>(targetTabId)
  const [initialOptions, setInitialOptions] = useState<SelectionOptions | null>(null)
  const [config, setConfig] = useState<ScrapeConfig>({
    mainSelector: '',
    columns: [{ name: 'Text', selector: '.' }],
  })

  // Use Dexie live query to get scrape result for current tab
  const scrapeData = useLiveQuery(
    () => (targetTabId ? liveGetScrapeResultForTab(targetTabId) : undefined),
    [targetTabId],
  )

  // Extract scrape result and config from Dexie data
  const scrapeResult = scrapeData?.result || null
  const resultProducingConfig = scrapeData?.config || null

  const [presets, setPresets] = useState<Preset[]>([])
  const [isScraping, setIsScraping] = useState(false)
  const [tabUrl, setTabUrl] = useState<string | null>(null)
  const [showPresets, setShowPresets] = useState(false)
  const [contentScriptCommsError, setContentScriptCommsError] = useState<string | null>(null)
  // Track last scrape row count for button feedback
  const [lastScrapeRowCount, setLastScrapeRowCount] = useState<number | null>(null)
  const dataTableRef = useRef<HTMLDivElement | null>(null)
  const [highlightMatchCount, setHighlightMatchCount] = useState<number | undefined>(undefined)
  const [highlightError, setHighlightError] = useState<string | undefined>(undefined)
  const [showEmptyRows, setShowEmptyRows] = useState(false)
  const [pickerModeActive, setPickerModeActive] = useState(false)
  const [batchScrapeEnabled, setBatchScrapeEnabled] = useState(false)

  // Memoized export filename (regenerates if tabUrl changes)
  const exportFilename = React.useMemo(() => {
    const dateTime = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0]
    const urlForSlug = tabUrl || 'unknown-url'
    const slugifiedUrl = slugify(urlForSlug, { lower: true, strict: true })
    return `Data export for ${slugifiedUrl} at ${dateTime}`
  }, [tabUrl])

  // Helper function to create default state
  const createDefaultState = (): Partial<SidePanelConfig> => {
    return {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
    }
  }

  // Keep the ref updated whenever the state changes
  useEffect(() => {
    targetTabIdRef.current = targetTabId
  }, [targetTabId])

  // Request tabId and tabUrl from browser.tabs API on mount
  useEffect(() => {
    log.debug('SidePanel mounted, requesting tabId and URL from browser.tabs API...')
    // Use `currentWindow: true` instead of `lastFocusedWindow: true` because the
    // side-panel itself becomes the *last focused* window in certain testing/
    // automation scenarios (e.g. Playwright) - likely due to PW_CHROMIUM_ATTACH_TO_OTHER = '1'.
    // When that happens the query returns an empty array because extension views
    // are not considered *tabs*, causing our fallback error path to trigger.
    // Limiting the query to the *current* window reliably returns the active
    // webpage tab that the side-panel is attached to.
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (browser.runtime.lastError) {
        log.error('Error querying tabs:', browser.runtime.lastError.message)
      } else if (tabs && tabs[0] && tabs[0].id) {
        log.debug(`Got initial tabId directly: ${tabs[0].id}`)
        const newTabId = tabs[0].id
        const newTabUrl = tabs[0].url || ''
        targetTabIdRef.current = newTabId
        setTargetTabId(newTabId)
        setTabUrl(newTabUrl)
        const sessionKey = `sidepanel_config_${newTabId}`
        storage.getItem<SidePanelConfig>(`session:${sessionKey}`).then((stored) => {
          if (stored) {
            log.debug('Initial data loaded from storage:', stored)
            handleInitialData({
              tabId: newTabId,
              config: stored,
            })
          } else {
            log.debug(`No initial data found in storage for tab ${newTabId}, using default state`)
            const defaultState = createDefaultState()
            handleInitialData({
              tabId: newTabId,
              config: defaultState,
            })
          }
        })
      } else {
        log.error('No active tab found in last focused window')
      }
    })
  }, [])

  // --- Unified utility to save all sidepanel state to session storage ---
  const saveSidePanelState = useCallback((tabId: number, updates: Partial<SidePanelConfig>) => {
    browser.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: { tabId, updates },
    })
  }, [])

  // --- Update config state and trigger saveSidePanelState ---
  const handleConfigChange = (newConfig: ScrapeConfig) => {
    const previousMainSelector = config.mainSelector
    const mainSelectorChanged = newConfig.mainSelector !== previousMainSelector

    setConfig(newConfig)

    // Only clear highlight state if the main selector actually changed
    if (mainSelectorChanged) {
      setHighlightMatchCount(undefined)
      setHighlightError(undefined)
    }

    if (targetTabId !== null) {
      const updates: Partial<SidePanelConfig> = {
        currentScrapeConfig: newConfig,
      }

      saveSidePanelState(targetTabId, updates)
    }
  }

  // Function to handle incoming initial/updated config data
  const handleInitialData = useCallback((payload: { tabId: number; config: SidePanelConfig }) => {
    // Only compare with targetTabIdRef if it has been set
    const currentExpectedTabId = targetTabIdRef.current
    if (currentExpectedTabId !== null && payload.tabId !== currentExpectedTabId) {
      log.warn(
        `handleInitialData called for wrong tab ${payload.tabId}, expected ${currentExpectedTabId}`,
      )
      return
    }

    log.debug(`Processing data for tab ${payload.tabId}:`, payload.config)
    const {
      selectionOptions,
      elementDetails,
      currentScrapeConfig,
      initialSelectionText,
      highlightMatchCount,
      highlightError,
      pickerModeActive,
    } = payload.config || {} // Default to empty object

    // --- Reset state before applying new data ---
    const defaultConfig: ScrapeConfig = {
      mainSelector: '',
      columns: [{ name: 'Text', selector: '.' }],
    }
    let newOptions: SelectionOptions | null = null // Explicitly allow null

    // Set config from storage if available. If not present, do not change config on highlight-only updates.
    if (currentScrapeConfig) {
      log.debug('Loading config from session storage:', currentScrapeConfig)
      const candidate: ScrapeConfig = {
        ...defaultConfig,
        ...currentScrapeConfig,
        columns:
          Array.isArray(currentScrapeConfig.columns) && currentScrapeConfig.columns.length > 0
            ? currentScrapeConfig.columns
            : defaultConfig.columns,
      }
      setConfig(candidate)
    } else if (elementDetails?.xpath) {
      // Fallback: If no saved config, but element details exist (e.g., from context menu),
      // initialize config with the XPath from the selected element.
      log.debug('Initializing config from elementDetails XPath:', elementDetails.xpath)
      const newConfig = {
        ...defaultConfig, // Start with default columns
        mainSelector: elementDetails.xpath,
      }
      setConfig(newConfig)
    } else {
      // No saved config and no element details - use default config (important for new tabs)
      log.debug('No saved config or element details, using default config')
      setConfig(defaultConfig)
    }

    // Update initial options used by the ConfigForm
    if (selectionOptions) {
      log.debug('Setting initialOptions from selectionOptions:', selectionOptions)
      newOptions = selectionOptions
    } else if (elementDetails) {
      // Construct initialOptions from elementDetails if selectionOptions not available
      log.debug('Constructing initialOptions from elementDetails')
      const options: SelectionOptions = {
        xpath: elementDetails.xpath,
        selectedText: initialSelectionText || elementDetails.text,
      }
      newOptions = options
    }
    // Update the initialOptions state
    setInitialOptions(newOptions)

    // Note: scrapeResult is now loaded from Dexie via useLiveQuery, not from session storage

    setIsScraping(false)

    // Restore highlight state if present
    setHighlightMatchCount(highlightMatchCount ?? undefined)
    setHighlightError(highlightError ?? undefined)

    // Restore picker mode state if present
    setPickerModeActive(pickerModeActive ?? false)
  }, [])

  // Initialize: load presets, listen for messages, AND listen for tab activation
  useEffect(() => {
    // Load presets (system + user, respecting status)
    const loadPresets = async () => {
      try {
        const loadedPresets = await getAllPresets()
        setPresets(loadedPresets)
      } catch (error) {
        log.error('Error loading presets:', error)
        setPresets([])
      }
    }

    loadPresets()

    // Listen for tab activation
    const tabActivationListener = (activeInfo: { tabId: number; previousTabId?: number }) => {
      log.debug(`SidePanel detected tab activation: ${activeInfo.tabId}`)
      const newTabId = activeInfo.tabId

      // Update ref directly for immediate use
      targetTabIdRef.current = newTabId
      // Also update state for component re-renders
      setTargetTabId(newTabId)

      // Get the new tab's URL and update tabUrl state
      browser.tabs.get(newTabId, (tab) => {
        if (browser.runtime.lastError) {
          log.error('Error getting tab info:', browser.runtime.lastError)
          setTabUrl(null)
        } else {
          setTabUrl(tab.url || '')
        }
      })

      // Load data directly from storage for the new tab
      const sessionKey = `sidepanel_config_${newTabId}`
      storage.getItem<SidePanelConfig>(`session:${sessionKey}`).then((stored) => {
        if (browser.runtime.lastError) {
          log.error(
            `Error loading data from storage for tab ${newTabId}:`,
            browser.runtime.lastError,
          )
          return
        }

        if (stored) {
          log.debug(`Data loaded from storage for newly activated tab ${newTabId}:`, stored)
          handleInitialData({
            tabId: newTabId,
            config: stored,
          })
        } else {
          log.debug(
            `No data found in storage for newly activated tab ${newTabId}, using default state`,
          )

          // Just use default state without saving it to storage
          const defaultState = createDefaultState()
          handleInitialData({
            tabId: newTabId,
            config: defaultState,
          })
        }
      })
    }

    // Listen for tab URL changes in the current tab
    const tabUpdateListener = (tabId: number) => {
      if (tabId === targetTabId) {
        browser.tabs.get(tabId, (updatedTab) => {
          if (browser.runtime.lastError) {
            setTabUrl('')
          } else {
            setTabUrl(updatedTab.url || '')
          }
        })
      }
    }

    browser.tabs.onActivated.addListener(tabActivationListener)
    browser.tabs.onUpdated.addListener(tabUpdateListener)

    // Cleanup listeners on component unmount
    return () => {
      log.debug('SidePanel unmounting, removing listeners...')
      browser.tabs.onActivated.removeListener(tabActivationListener)
      browser.tabs.onUpdated.removeListener(tabUpdateListener)
    }
  }, [targetTabId, handleInitialData])

  // ---------------------------------------------------------------------------
  // Watch current tab's per-session state and patch UI whenever it changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!targetTabId) return
    const key = `session:sidepanel_config_${targetTabId}` as const
    const unwatch = storage.watch<SidePanelConfig>(key, (newValue) => {
      if (newValue) {
        handleInitialData({ tabId: targetTabId, config: newValue })
      }
    })
    return () => unwatch()
  }, [targetTabId, handleInitialData])

  // ---------------------------------------------------------------------------
  // Watch preset collections (sync-area keys) – keeps local state in sync when
  // presets are created, deleted or system-preset visibility changes elsewhere.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unwatchUserPresets = storage.watch<Preset[]>(
      `sync:${STORAGE_KEYS.USER_PRESETS}` as const,
      () => getAllPresets().then(setPresets),
    )
    const unwatchSystemPresetStatus = storage.watch<Record<string, boolean>>(
      'sync:system_preset_status' as const,
      () => getAllPresets().then(setPresets),
    )
    return () => {
      unwatchUserPresets()
      unwatchSystemPresetStatus()
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Load batch scrape feature flag and watch for changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED).then(setBatchScrapeEnabled)

    const unwatchFeatureFlags = storage.watch('local:featureFlags', async () => {
      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      setBatchScrapeEnabled(enabled)
    })
    const unwatchOverrides = storage.watch('local:featureFlagOverrides', async () => {
      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      setBatchScrapeEnabled(enabled)
    })

    return () => {
      unwatchFeatureFlags()
      unwatchOverrides()
    }
  }, [])

  // Show toast when contentScriptCommsError changes
  React.useEffect(() => {
    if (contentScriptCommsError) {
      toast.error(contentScriptCommsError)
    }
  }, [contentScriptCommsError])

  // Handle scrape request
  const handleScrape = () => {
    setShowPresets(false)
    setContentScriptCommsError(null)
    if (!targetTabId) return
    setIsScraping(true)
    // Capture the exact config used for this scrape
    const configAtScrapeTime = config

    // Send scrape request to background (backend)
    // Background will handle content script communication and storage
    browser.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.SCRAPE_PAGE,
        payload: {
          tabId: targetTabId,
          config: configAtScrapeTime,
        },
      },
      (response) => {
        setIsScraping(false)
        if (!response && browser.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to background service. Please try reloading the extension.',
          )
          setLastScrapeRowCount(null)
          return
        }
        if (response?.error) {
          setContentScriptCommsError(response.error)
          setLastScrapeRowCount(null)
          log.error('Error during scrape:', response.error)
          return
        }
        // Successful scrape - result is in Dexie and will appear via useLiveQuery
        if (response?.success === true) {
          // Persist recent main selector (local only) if it is not a preset selector
          ;(async () => {
            const selectorUsed = (configAtScrapeTime.mainSelector || '').trim()
            if (!selectorUsed) return
            try {
              const allPresets = await getAllPresets()
              const isPresetSelector = allPresets.some(
                (p) => (p.config.mainSelector || '').trim() === selectorUsed,
              )
              if (!isPresetSelector) {
                await pushRecentMainSelector(selectorUsed)
              }
            } catch (err) {
              // Non-fatal: ignore errors when saving recent selectors
            }
          })()
        }
        setLastScrapeRowCount(response?.data?.data?.length ?? 0)
      },
    )
  }

  // Scroll table into view when it appears (first time or after clearing)
  React.useEffect(() => {
    if (scrapeResult && scrapeResult.data.length > 0 && dataTableRef.current) {
      dataTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrapeResult?.data.length])

  // Handle highlight request
  const handleHighlight = (selector: string) => {
    setContentScriptCommsError(null)
    if (!targetTabId) return
    browser.tabs.sendMessage(
      targetTabId,
      {
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector },
      },
      (response) => {
        if (!response && browser.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
          )
          return
        }

        if (response && response.success === false && response.error) {
          // Update local state immediately for responsive UI
          setHighlightMatchCount(undefined)
          setHighlightError(response.error)
          saveSidePanelState(targetTabId, {
            highlightMatchCount: null,
            highlightError: response.error,
          })
        } else if (response && typeof response.matchCount === 'number') {
          // Update local state immediately for responsive UI
          setHighlightMatchCount(response.matchCount)
          setHighlightError(undefined)
          saveSidePanelState(targetTabId, {
            highlightMatchCount: response.matchCount,
            highlightError: null,
          })
        }
      },
    )
  }

  // Handle row highlight request (separately to avoid updating main selector state)
  const handleRowHighlight = (selector: string) => {
    setContentScriptCommsError(null)
    if (!targetTabId) return
    browser.tabs.sendMessage(
      targetTabId,
      {
        type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT,
        payload: { selector },
      },
      (response) => {
        if (!response && browser.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
          )
        }
      },
    )
  }

  // Handle picker mode toggle
  const handlePickerMode = () => {
    setContentScriptCommsError(null)
    if (!targetTabId) return
    browser.tabs.sendMessage(
      targetTabId,
      {
        type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
        payload: { source: 'button' },
      },
      (response) => {
        if (!response && browser.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
          )
        } else if (response && response.success) {
          log.debug('Picker mode toggled successfully')
        }
      },
    )
  }

  const handleLoadPreset = (preset: Preset) => {
    handleConfigChange(preset.config)

    // Trigger highlighting if the preset has a main selector
    if (preset.config.mainSelector) {
      handleHighlight(preset.config.mainSelector)
    }

    // Track preset loaded event
    trackEvent(ANALYTICS_EVENTS.PRESET_LOAD, {
      type: isSystemPreset(preset) ? 'system' : 'user',
      preset_name: isSystemPreset(preset) ? preset.name : null,
      preset_id: isSystemPreset(preset) ? preset.id : null,
    })
  }

  const handleSavePreset = async (name: string) => {
    const preset: Preset = {
      id: Date.now().toString(),
      name,
      config,
      createdAt: Date.now(),
    }
    try {
      const success = await savePreset(preset)
      if (success) {
        const updatedPresets = await getAllPresets()
        setPresets(updatedPresets)
        log.debug('Preset saved successfully and UI updated')

        // Track preset saved event
        trackEvent(ANALYTICS_EVENTS.PRESET_SAVE, {
          type: 'user',
          columns_count: config.columns.length,
        })
      } else {
        log.error('Failed to save preset')
      }
    } catch (error) {
      log.error('Error saving preset:', error)
    }
  }

  // Hide system preset or delete user preset
  const handleDeletePreset = async (preset: Preset) => {
    if (isSystemPreset(preset)) {
      // Hide system preset by setting enabled=false in status map
      const statusMap = await getSystemPresetStatus()
      statusMap[preset.id] = false
      await setSystemPresetStatus(statusMap)
      toast.success(`System preset "${preset.name}" hidden.`)
      // Reload all presets
      const updatedPresets = await getAllPresets()
      setPresets(updatedPresets)

      // Track preset hidden event
      trackEvent(ANALYTICS_EVENTS.PRESET_HIDE, {
        type: 'system',
        preset_name: preset.name,
        preset_id: preset.id,
      })
      return
    }
    // Otherwise, delete user preset as before
    try {
      const success = await deletePreset(preset.id)
      if (success) {
        const updatedPresets = await getAllPresets()
        setPresets(updatedPresets)
        toast.success(
          <>
            Preset "<span className="ph_hidden">{preset.name}</span>" deleted
          </>,
        )

        // Track preset deleted event
        trackEvent(ANALYTICS_EVENTS.PRESET_DELETION, {
          type: 'user',
        })
      } else {
        toast.error(
          <>
            Error, preset "<span className="ph_hidden">{preset.name}</span>" couldn't be deleted
          </>,
        )
      }
    } catch (error) {
      log.error('Error deleting preset:', error)
    }
  }

  // Reset (enable) all system presets
  const handleResetSystemPresets = async () => {
    await setSystemPresetStatus({}) // Clear all disables
    const updatedPresets = await getAllPresets()
    setPresets(updatedPresets)
    toast.success('System presets have been reset')

    // Track system presets reset event
    trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET, {
      type: 'system',
    })
  }

  // Check if the current tab is showing the full data view
  if (tabUrl?.startsWith(`chrome-extension://${chromeExtensionId}/full-data-view.html`)) {
    return (
      <div className="flex flex-col h-screen font-sans min-w-0 max-w-full w-full box-border">
        <Toaster />
        <ConsentWrapper>
          <main className="flex-1 flex min-w-0 w-full">
            <ExtensionPageControls
              title="Full Screen View Active"
              currentTabUrl={tabUrl}
              currentTabId={targetTabId}
              showBackButton={true}
            />
          </main>
        </ConsentWrapper>
      </div>
    )
  }

  // Check if the current tab is showing batch scrape pages
  if (
    tabUrl?.startsWith(`chrome-extension://${chromeExtensionId}/batch-scrape.html`) ||
    tabUrl?.startsWith(`chrome-extension://${chromeExtensionId}/batch-scrape-history.html`)
  ) {
    return (
      <div className="flex flex-col h-screen font-sans min-w-0 max-w-full w-full box-border">
        <Toaster />
        <ConsentWrapper>
          <main className="flex-1 flex min-w-0 w-full">
            <ExtensionPageControls title="Batch Scrape Mode Active" />
          </main>
        </ConsentWrapper>
      </div>
    )
  }

  if (tabUrl !== null && !isInjectableUrl(tabUrl)) {
    return (
      <div className="flex flex-col h-screen font-sans min-w-0 max-w-full w-full box-border">
        <Toaster />
        <ConsentWrapper>
          <main className="flex-1 flex min-w-0 w-full">
            <SplashScreen tabUrl={tabUrl} />
          </main>
        </ConsentWrapper>
        <Footer
          showSettings={true}
          onResetSystemPresets={handleResetSystemPresets}
          debugMode={debugMode}
          onDebugModeChange={onDebugModeChange}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen font-sans overflow-visible min-w-0 max-w-full w-full box-border">
      <Toaster />
      <ConsentWrapper>
        <main className="flex-1 overflow-y-auto p-4 w-full min-w-0 box-border">
          <div className="flex flex-col gap-10 w-full min-w-0 box-border">
            <ConfigForm
              config={config}
              onChange={handleConfigChange}
              onScrape={handleScrape}
              onHighlight={handleHighlight}
              onPickerMode={handlePickerMode}
              isLoading={isScraping}
              initialOptions={initialOptions}
              presets={presets}
              onLoadPreset={handleLoadPreset}
              onSavePreset={handleSavePreset}
              onDeletePreset={handleDeletePreset}
              showPresets={showPresets}
              setShowPresets={setShowPresets}
              lastScrapeRowCount={lastScrapeRowCount}
              onClearLastScrapeRowCount={() => setLastScrapeRowCount(null)}
              highlightMatchCount={highlightMatchCount}
              highlightError={highlightError}
              pickerModeActive={pickerModeActive}
              tabUrl={tabUrl}
              batchScrapeEnabled={batchScrapeEnabled}
              // Show rescrape hint when there is data and config differs from the config that produced it
              rescrapeAdvised={
                !!(scrapeResult && scrapeResult.data && scrapeResult.data.length > 0) &&
                !!resultProducingConfig &&
                ((): boolean => {
                  const current = config
                  const producing = resultProducingConfig

                  // Check main selector
                  if (current.mainSelector !== producing.mainSelector) return true

                  // Check columns count
                  if (current.columns.length !== producing.columns.length) return true

                  // Check each column
                  for (let i = 0; i < current.columns.length; i++) {
                    const currentCol = current.columns[i]
                    const producingCol = producing.columns[i]
                    if (!producingCol) return true
                    if (currentCol.name !== producingCol.name) return true
                    if (currentCol.selector !== producingCol.selector) return true
                    const currentKey = currentCol.key || currentCol.name
                    const producingKey = producingCol.key || producingCol.name
                    if (currentKey !== producingKey) return true
                  }
                  return false
                })()
              }
            />
            {scrapeResult && scrapeResult.data.length > 0 && (
              <div className="flex flex-col gap-6" ref={dataTableRef}>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold">Extracted Data</h2>
                  <div className="flex items-center gap-2">
                    {scrapeData && targetTabId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const job = await getScrapeJobForTab(targetTabId)
                            if (job && job.tabId) {
                              await promoteScrapeJob(job.id)
                              toast.success('Scrape saved permanently')
                            } else {
                              toast.info('Scrape is already saved')
                            }
                          } catch (error) {
                            log.error('Error promoting scrape:', error)
                            toast.error('Failed to save scrape')
                          }
                        }}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    )}
                    <ExportButtons
                      scrapeResult={scrapeResult}
                      config={config}
                      showEmptyRows={showEmptyRows}
                      filename={exportFilename}
                      variant="outline"
                    />
                  </div>
                </div>
                <DataTable
                  data={scrapeResult.data || []}
                  onRowHighlight={handleRowHighlight}
                  config={config}
                  columnOrder={scrapeResult.columnOrder}
                  showEmptyRows={showEmptyRows}
                  onShowEmptyRowsChange={setShowEmptyRows}
                  tabId={targetTabId}
                />
              </div>
            )}
          </div>
        </main>
      </ConsentWrapper>
      <Footer
        showSettings={true}
        onResetSystemPresets={handleResetSystemPresets}
        debugMode={debugMode}
        onDebugModeChange={onDebugModeChange}
      />
    </div>
  )
}

export default SidePanel
