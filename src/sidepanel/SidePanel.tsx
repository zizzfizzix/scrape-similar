import ConfigForm from '@/components/ConfigForm'
import DataTable from '@/components/DataTable'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Footer } from '@/components/ui/footer'
import { Toaster } from '@/components/ui/sonner'
import {
  STORAGE_KEYS,
  deletePreset,
  getAllPresets,
  getSystemPresetStatus,
  savePreset,
  setSystemPresetStatus,
} from '@/core/storage'
import { SYSTEM_PRESETS } from '@/core/system_presets'
import {
  MESSAGE_TYPES,
  Preset,
  ScrapeConfig,
  ScrapedDataResult,
  SelectionOptions,
  SidePanelConfig,
} from '@/core/types'
import { isInjectableUrl } from '@/lib/isInjectableUrl'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import slugify from 'slugify'
import { toast } from 'sonner'

// Simple splash screen component
const SplashScreen: React.FC = () => (
  <div className="flex flex-1 items-center justify-center w-full min-w-0">
    <div className="flex flex-col items-center justify-center text-center w-full max-w-md mx-auto">
      <h2 className="text-2xl mb-4">Unsupported URL</h2>
      <p className="text-lg mb-2">
        For security reasons this extension can't work on chrome:// and Chrome Web Store URLs.
      </p>
    </div>
  </div>
)

// Clipboard utility
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('Failed to copy:', err)
    return false
  }
}

const SidePanel: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'config' | 'data' | 'presets'>('config')
  const [targetTabId, setTargetTabId] = useState<number | null>(null)
  // Ref to hold the current targetTabId
  const targetTabIdRef = useRef<number | null>(targetTabId)
  const [initialOptions, setInitialOptions] = useState<SelectionOptions | null>(null)
  const [config, setConfig] = useState<ScrapeConfig>({
    mainSelector: '',
    columns: [{ name: 'Text', selector: '.' }],
  })
  const [scrapedData, setScrapedData] = useState<ScrapedDataResult | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [isScraping, setIsScraping] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<{
    success?: boolean
    url?: string
    error?: string
  } | null>(null)
  const [tabUrl, setTabUrl] = useState<string | null>(null)
  const [showPresets, setShowPresets] = useState(false)
  const [contentScriptCommsError, setContentScriptCommsError] = useState<string | null>(null)
  // Track last scrape row count for button feedback
  const [lastScrapeRowCount, setLastScrapeRowCount] = useState<number | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dataTableRef = useRef<HTMLDivElement | null>(null)
  const [highlightMatchCount, setHighlightMatchCount] = useState<number | undefined>(undefined)
  const [highlightError, setHighlightError] = useState<string | undefined>(undefined)

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
      scrapedData: [],
    }
  }

  // Keep the ref updated whenever the state changes
  useEffect(() => {
    targetTabIdRef.current = targetTabId
  }, [targetTabId])

  // Request tabId and tabUrl from chrome.tabs API on mount
  useEffect(() => {
    console.log('SidePanel mounted, requesting tabId and URL from chrome.tabs API...')
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError.message)
      } else if (tabs && tabs[0] && tabs[0].id) {
        console.log(`Got initial tabId directly: ${tabs[0].id}`)
        const newTabId = tabs[0].id
        const newTabUrl = tabs[0].url || ''
        targetTabIdRef.current = newTabId
        setTargetTabId(newTabId)
        setTabUrl(newTabUrl)
        const sessionKey = `sidepanel_config_${newTabId}`
        chrome.storage.session.get(sessionKey, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Error loading initial data from storage:', chrome.runtime.lastError)
            return
          }
          if (result[sessionKey]) {
            console.log('Initial data loaded from storage:', result[sessionKey])
            handleInitialData({
              tabId: newTabId,
              config: result[sessionKey],
            })
          } else {
            console.log(`No initial data found in storage for tab ${newTabId}, using default state`)
            const defaultState = createDefaultState()
            handleInitialData({
              tabId: newTabId,
              config: defaultState,
            })
          }
        })
      } else {
        console.error('No active tab found in last focused window')
      }
    })
  }, [])

  // Debounced function to save config changes directly to session storage
  const debouncedSaveConfig = useCallback(
    debounce((newConfig: ScrapeConfig, tabId: number) => {
      console.log(`Debounced save for tab ${tabId}:`, newConfig)
      const sessionKey = `sidepanel_config_${tabId}`

      // Get current storage data first to merge properly
      chrome.storage.session.get(sessionKey, (result) => {
        const currentData = result[sessionKey] || {}

        // Update with new config
        const updatedData = {
          ...currentData,
          currentScrapeConfig: newConfig,
        }

        // Save directly to storage
        console.log(`Saving config directly to session storage:`, updatedData)
        chrome.storage.session.set({ [sessionKey]: updatedData })
      })
    }, 500), // 500ms debounce interval
    [],
  )

  // Update config state and trigger debounced save
  const handleConfigChange = (newConfig: ScrapeConfig) => {
    setConfig(newConfig)
    if (targetTabId !== null) {
      debouncedSaveConfig(newConfig, targetTabId)
    }
    // Reset highlight badge and error if mainSelector changes
    setHighlightMatchCount(undefined)
    setHighlightError(undefined)
  }

  // Function to handle incoming initial/updated config data
  const handleInitialData = useCallback(
    (payload: { tabId: number; config: Partial<SidePanelConfig> }) => {
      // Only compare with targetTabIdRef if it has been set
      const currentExpectedTabId = targetTabIdRef.current
      if (currentExpectedTabId !== null && payload.tabId !== currentExpectedTabId) {
        console.warn(
          `handleInitialData called for wrong tab ${payload.tabId}, expected ${currentExpectedTabId}`,
        )
        return
      }

      console.log(`Processing data for tab ${payload.tabId}:`, payload.config)
      const {
        selectionOptions,
        elementDetails,
        currentScrapeConfig,
        initialSelectionText,
        scrapedData,
      } = payload.config || {} // Default to empty object

      // --- Reset state before applying new data ---
      const defaultConfig: ScrapeConfig = {
        mainSelector: '',
        columns: [{ name: 'Text', selector: '.' }],
      }
      let newConfig = defaultConfig
      let newOptions: SelectionOptions | null = null // Explicitly allow null

      // Set config from storage if available
      if (currentScrapeConfig) {
        console.log('Loading config from session storage:', currentScrapeConfig)
        newConfig = {
          ...defaultConfig,
          ...currentScrapeConfig,
          columns:
            Array.isArray(currentScrapeConfig.columns) && currentScrapeConfig.columns.length > 0
              ? currentScrapeConfig.columns
              : defaultConfig.columns,
        }
      } else if (elementDetails?.xpath) {
        // Fallback: If no saved config, but element details exist (e.g., from context menu),
        // initialize config with the XPath from the selected element.
        console.log('Initializing config from elementDetails XPath:', elementDetails.xpath)
        newConfig = {
          ...defaultConfig, // Start with default columns
          mainSelector: elementDetails.xpath,
        }
      }
      // Update the config state
      setConfig(newConfig)

      // Update initial options used by the ConfigForm
      if (selectionOptions) {
        console.log('Setting initialOptions from selectionOptions:', selectionOptions)
        newOptions = selectionOptions
      } else if (elementDetails) {
        // Construct initialOptions from elementDetails if selectionOptions not available
        console.log('Constructing initialOptions from elementDetails')
        const options: SelectionOptions = {
          xpath: elementDetails.xpath,
          selectedText: initialSelectionText || elementDetails.text,
          previewData: [], // Preview might need separate handling or message
        }
        newOptions = options
      }
      // Update the initialOptions state
      setInitialOptions(newOptions)

      // Load saved scraped data from session storage if available
      if (
        scrapedData &&
        typeof scrapedData === 'object' &&
        'data' in scrapedData &&
        'columnOrder' in scrapedData
      ) {
        setScrapedData(scrapedData as ScrapedDataResult)
      } else {
        setScrapedData(null)
      }

      setExportStatus(null)
      setIsScraping(false)
      setIsExporting(false)
    },
    [],
  )

  // Initialize: load presets, listen for messages, AND listen for tab activation
  useEffect(() => {
    // Load presets (system + user, respecting status)
    const loadPresets = async () => {
      try {
        const loadedPresets = await getAllPresets()
        setPresets(loadedPresets)
      } catch (error) {
        console.error('Error loading presets:', error)
        setPresets([])
      }
    }

    loadPresets()

    // Listen for tab activation
    const tabActivationListener = (activeInfo: chrome.tabs.TabActiveInfo) => {
      console.log(`SidePanel detected tab activation: ${activeInfo.tabId}`)
      const newTabId = activeInfo.tabId

      // Update ref directly for immediate use
      targetTabIdRef.current = newTabId
      // Also update state for component re-renders
      setTargetTabId(newTabId)

      // Get the new tab's URL and update tabUrl state
      chrome.tabs.get(newTabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting tab info:', chrome.runtime.lastError)
          setTabUrl(null)
        } else {
          setTabUrl(tab.url || '')
        }
      })

      // Load data directly from storage for the new tab
      const sessionKey = `sidepanel_config_${newTabId}`
      chrome.storage.session.get(sessionKey, (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            `Error loading data from storage for tab ${newTabId}:`,
            chrome.runtime.lastError,
          )
          return
        }

        if (result[sessionKey]) {
          console.log(
            `Data loaded from storage for newly activated tab ${newTabId}:`,
            result[sessionKey],
          )
          handleInitialData({
            tabId: newTabId,
            config: result[sessionKey],
          })
        } else {
          console.log(
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

    // Listen for storage changes to update UI when storage is modified
    const storageChangeListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      // Handle session storage changes (tab-specific data)
      if (areaName === 'session') {
        const currentTabId = targetTabIdRef.current
        if (currentTabId) {
          const sessionKey = `sidepanel_config_${currentTabId}`

          if (changes[sessionKey]) {
            console.log(
              `Storage change detected for current tab ${currentTabId}:`,
              changes[sessionKey],
            )
            const newValue = changes[sessionKey].newValue

            // Use the new value directly instead of making an additional request
            if (newValue) {
              console.log('Updating UI directly with storage change data:', newValue)

              // Pass the current tab ID from the ref to ensure consistency
              handleInitialData({
                tabId: currentTabId,
                config: newValue,
              })
            }
          }
        }
      }

      // Handle synced storage changes (global presets or system preset status)
      if (
        areaName === 'sync' &&
        (changes[STORAGE_KEYS.GLOBAL_PRESETS] || changes['system_preset_status'])
      ) {
        // Reload all presets
        getAllPresets().then(setPresets)
      }
    }

    // Listen for tab URL changes in the current tab
    const tabUpdateListener = (tabId: number) => {
      if (tabId === targetTabId) {
        chrome.tabs.get(tabId, (updatedTab) => {
          if (chrome.runtime.lastError) {
            setTabUrl('')
          } else {
            setTabUrl(updatedTab.url || '')
          }
        })
      }
    }

    chrome.tabs.onActivated.addListener(tabActivationListener)
    chrome.storage.onChanged.addListener(storageChangeListener)
    chrome.tabs.onUpdated.addListener(tabUpdateListener)

    // Cleanup listeners on component unmount
    return () => {
      console.log('SidePanel unmounting, removing listeners...')
      chrome.tabs.onActivated.removeListener(tabActivationListener)
      chrome.storage.onChanged.removeListener(storageChangeListener)
      chrome.tabs.onUpdated.removeListener(tabUpdateListener)
    }
  }, [targetTabId, handleInitialData])

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
    chrome.tabs.sendMessage(
      targetTabId,
      {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      },
      (response) => {
        setIsScraping(false)
        if (!response && chrome.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
          )
          setLastScrapeRowCount(null)
          return
        }
        if (response?.error) {
          setContentScriptCommsError(response.error)
          setLastScrapeRowCount(null)
          console.error('Error during scrape:', response.error)
          return
        }
        setLastScrapeRowCount(response?.data?.data?.length ?? 0)
      },
    )
  }

  // Scroll table into view when it appears (first time or after clearing)
  React.useEffect(() => {
    if (scrapedData && scrapedData.data.length > 0 && dataTableRef.current) {
      dataTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrapedData?.data.length])

  // Handle highlight request
  const handleHighlight = (selector: string) => {
    setContentScriptCommsError(null)
    if (!targetTabId) return
    chrome.tabs.sendMessage(
      targetTabId,
      {
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector },
      },
      (response) => {
        if (!response && chrome.runtime.lastError) {
          setContentScriptCommsError(
            'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
          )
        } else if (response && response.success === false && response.error) {
          setHighlightError(response.error)
          setHighlightMatchCount(undefined)
        } else if (response && typeof response.matchCount === 'number') {
          setHighlightMatchCount(response.matchCount)
          setHighlightError(undefined)
        }
      },
    )
  }

  const handleLoadPreset = (preset: Preset) => {
    handleConfigChange(preset.config)
    setActiveTab('config')
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
        console.log('Preset saved successfully and UI updated')
      } else {
        console.error('Failed to save preset')
      }
    } catch (error) {
      console.error('Error saving preset:', error)
    }
  }

  // Hide system preset or delete user preset
  const handleDeletePreset = async (preset: Preset) => {
    // Check if this is a system preset
    const isSystemPreset = SYSTEM_PRESETS.some((p) => p.id === preset.id)
    if (isSystemPreset) {
      // Hide system preset by setting enabled=false in status map
      const statusMap = await getSystemPresetStatus()
      statusMap[preset.id] = false
      await setSystemPresetStatus(statusMap)
      toast.success(`System preset "${preset.name}" hidden.`)
      // Reload all presets
      const updatedPresets = await getAllPresets()
      setPresets(updatedPresets)
      return
    }
    // Otherwise, delete user preset as before
    try {
      const success = await deletePreset(preset.id)
      if (success) {
        const updatedPresets = await getAllPresets()
        setPresets(updatedPresets)
        toast.success(`Preset "${preset.name}" deleted`)
      } else {
        toast.error(`Error, preset "${preset.name}" couldn't be deleted`)
      }
    } catch (error) {
      console.error('Error deleting preset:', error)
    }
  }

  // Reset (enable) all system presets
  const handleResetSystemPresets = async () => {
    await setSystemPresetStatus({}) // Clear all disables
    const updatedPresets = await getAllPresets()
    setPresets(updatedPresets)
    toast.success('System presets have been reset')
  }

  const handleExport = () => {
    if (!scrapedData) return
    setIsExporting(true)
    setExportStatus(null)
    const columns = scrapedData?.columnOrder || []
    const orderedData =
      scrapedData?.data.map((row: Record<string, string>) => {
        const orderedRow: { [key: string]: string } = {}
        columns.forEach((header) => {
          orderedRow[header] = row[header] || ''
        })
        return orderedRow
      }) || []
    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.EXPORT_TO_SHEETS,
        payload: {
          filename: exportFilename,
          scrapedData: orderedData,
        },
      },
      (response) => {
        setIsExporting(false)
        setExportStatus(response)
        if (response?.success && response.url) {
          toast.success('Exported to Google Sheets', {
            description: (
              <span>
                <a
                  href={response.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  Open Sheet
                </a>
              </span>
            ),
          })
          setIsDropdownOpen(false)
        } else {
          toast.error(response?.error || 'Export failed')
          setIsDropdownOpen(false)
        }
      },
    )
  }

  const handleCsvExport = () => {
    if (!scrapedData || !scrapedData.data.length) return
    const columns = scrapedData.columnOrder || []
    const csvContent = [
      columns.map((header) => `"${header.replace(/"/g, '""')}"`).join(','),
      ...scrapedData.data.map((row: Record<string, string>) =>
        columns
          .map((header) => {
            const value = row[header] || ''
            const escapedValue = value.replace(/"/g, '""')
            return `"${escapedValue}"`
          })
          .join(','),
      ),
    ].join('\n')
    const filename = `${exportFilename}.csv`
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('CSV file saved')
      setIsDropdownOpen(false)
    } catch (e) {
      toast.error('Failed to save CSV')
      setIsDropdownOpen(false)
    }
  }

  // source: https://en.wikipedia.org/wiki/Tab-separated_values#Character_escaping
  const escapeTsvField = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')

  const handleCopyTsv = async () => {
    if (!scrapedData || !scrapedData.data.length) return
    const columns = scrapedData.columnOrder || []
    const tsvContent = [
      columns.join('\t'),
      ...scrapedData.data.map((row: Record<string, string>) =>
        columns
          .map((header) => {
            const value = row[header] || ''
            return escapeTsvField(String(value))
          })
          .join('\t'),
      ),
    ].join('\n')
    try {
      await copyToClipboard(tsvContent)
      toast.success('Copied to clipboard')
      setIsDropdownOpen(false)
    } catch {
      toast.error('Failed to copy')
      setIsDropdownOpen(false)
    }
  }

  useEffect(() => {
    const handleRuntimeMessage = (message: any) => {
      if (message.type === MESSAGE_TYPES.HIGHLIGHT_RESULT_FROM_CONTEXT_MENU) {
        if (typeof message.payload?.matchCount === 'number') {
          setHighlightMatchCount(message.payload.matchCount)
          setHighlightError(undefined)
        } else if (message.payload?.error) {
          setHighlightError(message.payload.error)
          setHighlightMatchCount(undefined)
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)
    return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
  }, [])

  if (tabUrl !== null && !isInjectableUrl(tabUrl)) {
    return (
      <div className="flex flex-col h-screen font-sans min-w-0 max-w-full w-full box-border">
        <main className="flex-1 flex min-w-0 w-full">
          <SplashScreen />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen font-sans overflow-visible min-w-0 max-w-full w-full box-border">
      <Toaster />
      <main className="flex-1 overflow-y-auto p-4 w-full min-w-0 box-border">
        <div className="flex flex-col gap-10 w-full min-w-0 box-border">
          <ConfigForm
            config={config}
            onChange={handleConfigChange}
            onScrape={handleScrape}
            onHighlight={handleHighlight}
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
          />
          {scrapedData && scrapedData.data.length > 0 && (
            <div className="flex flex-col gap-6" ref={dataTableRef}>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold">Extracted Data</h2>
                <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        if (!isExporting) handleExport()
                      }}
                      disabled={isExporting}
                    >
                      {isExporting ? 'Exporting…' : 'Export to Google Sheets'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        handleCsvExport()
                      }}
                    >
                      Save as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        handleCopyTsv()
                      }}
                    >
                      Copy to clipboard
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <DataTable
                data={scrapedData.data}
                onHighlight={handleHighlight}
                config={config}
                columnOrder={scrapedData.columnOrder}
              />
            </div>
          )}
        </div>
      </main>
      <Footer onResetSystemPresets={handleResetSystemPresets} />
    </div>
  )
}

// Simple debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<F>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => func(...args), waitFor)
  }
}

export default SidePanel
