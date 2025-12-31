import { AppHeader } from '@/components/AppHeader'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import ExportButtons from '@/components/ExportButtons'
import { Footer } from '@/components/footer'
import ResultsTable from '@/components/ResultsTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { isDevOrTest } from '@/utils/modeTest'
import { MESSAGE_TYPES } from '@/utils/types'
import { useNavigate, useParams } from '@tanstack/react-router'
import log from 'loglevel'
import { ArrowLeft, ChevronsUpDown } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

interface TabData {
  tabId: number
  tabUrl: string
  tabTitle: string
  scrapeResult: ScrapeResult
  config: ScrapeConfig
}

const DataViewPage: React.FC = () => {
  // Get tab ID from URL params
  const { tabId: tabIdParam } = useParams({ from: '/data/$tabId' })
  const initialTabId = parseInt(tabIdParam)
  const navigate = useNavigate()

  // State
  const [currentTabId, setCurrentTabId] = useState<number | null>(initialTabId)
  const [allTabsData, setAllTabsData] = useState<TabData[]>([])
  const [currentTabData, setCurrentTabData] = useState<TabData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<ScrapedRow[]>([])

  // Tab selector state
  const [isTabSelectorOpen, setIsTabSelectorOpen] = useState(false)
  const [tabSearch, setTabSearch] = useState('')

  // Load data from storage
  const loadTabsData = useCallback(
    async (preserveCurrentSelection = false) => {
      try {
        setLoading(true)
        setError(null)

        // Get all tabs with the browser API
        const tabs = await browser.tabs.query({})
        const tabsWithData: TabData[] = []

        // Check each tab for stored data
        for (const tab of tabs) {
          if (!tab.id) continue

          const sessionKey = `sidepanel_config_${tab.id}`
          try {
            const storedData = await storage.getItem<SidePanelConfig>(`session:${sessionKey}`)
            if (storedData?.scrapeResult?.data && storedData.scrapeResult.data.length > 0) {
              tabsWithData.push({
                tabId: tab.id,
                tabUrl: tab.url || 'Unknown URL',
                tabTitle: tab.title || 'Unknown Title',
                scrapeResult: storedData.scrapeResult,
                config: storedData.currentScrapeConfig || {
                  mainSelector: '',
                  columns: [{ name: 'Text', selector: '.' }],
                },
              })
            }
          } catch (err) {
            log.warn(`Error loading data for tab ${tab.id}:`, err)
          }
        }

        setAllTabsData(tabsWithData)

        // Only update current tab selection if not preserving current selection
        if (!preserveCurrentSelection) {
          // Set current tab data
          if (currentTabId) {
            const currentData = tabsWithData.find((data) => data.tabId === currentTabId)
            setCurrentTabData(currentData || null)
            if (!currentData && tabsWithData.length > 0) {
              // Fallback to first available tab if specified tab not found
              setCurrentTabId(tabsWithData[0].tabId)
              setCurrentTabData(tabsWithData[0])
            } else if (!currentData && tabsWithData.length === 0) {
              // No data available anywhere, reset current tab
              setCurrentTabId(null)
              setCurrentTabData(null)
            }
          } else if (tabsWithData.length > 0) {
            // No specific tab requested, use first available
            setCurrentTabId(tabsWithData[0].tabId)
            setCurrentTabData(tabsWithData[0])
          }
        } else {
          // Preserve current selection but update the data if available
          if (currentTabId) {
            const currentData = tabsWithData.find((data) => data.tabId === currentTabId)
            if (currentData) {
              setCurrentTabData(currentData)
            }
          }
        }
      } catch (err) {
        setError('Failed to load tab data: ' + (err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [currentTabId],
  )

  // Load data on mount
  useEffect(() => {
    loadTabsData()
  }, [loadTabsData])

  useEffect(() => {
    storage.getItem<boolean>('local:debugMode').then((val) => {
      if (isDevOrTest) {
        log.setLevel('trace')
      } else {
        log.setLevel(val ? 'trace' : 'error')
      }
    })

    const unwatch = storage.watch<boolean>('local:debugMode', (val) => {
      if (!isDevOrTest) {
        log.setLevel(val ? 'trace' : 'error')
      }
    })

    return () => unwatch()
  }, [])

  // Update document title when current tab changes
  useEffect(() => {
    if (currentTabData?.tabTitle) {
      document.title = `${currentTabData.tabTitle} - Extracted Data - Scrape Similar`
    } else {
      document.title = 'Full Data View - Scrape Similar'
    }
  }, [currentTabData?.tabTitle])

  // Watch for storage changes to update data in real-time
  useEffect(() => {
    const unwatchCallbacks: (() => void)[] = []

    // Function to set up a watcher for a specific tab
    const setupSingleTabWatcher = (tabId: number) => {
      const sessionKey = `sidepanel_config_${tabId}`
      const unwatch = storage.watch<SidePanelConfig>(`session:${sessionKey}`, async (newValue) => {
        // Update only the specific tab that changed, preserve user's current selection
        const tabInfo = await browser.tabs.get(tabId).catch(() => null)
        if (!tabInfo) return

        if (!newValue?.scrapeResult?.data || newValue.scrapeResult.data.length === 0) {
          // Data was removed - remove this tab from our list
          setAllTabsData((prev) => {
            const filtered = prev.filter((tabData) => tabData.tabId !== tabId)
            // If this was the current tab and there are other tabs, switch to first available
            if (currentTabId === tabId && filtered.length > 0) {
              const newTab = filtered[0]
              setCurrentTabId(newTab.tabId)
              setCurrentTabData(newTab)
              // Update URL
              navigate({
                to: '/data/$tabId',
                params: { tabId: newTab.tabId.toString() },
              })
            } else if (currentTabId === tabId) {
              // No other tabs available
              setCurrentTabId(null)
              setCurrentTabData(null)
            }
            return filtered
          })
        } else {
          // Update or add the tab data
          const updatedTabData: TabData = {
            tabId: tabId,
            tabUrl: tabInfo.url || 'Unknown URL',
            tabTitle: tabInfo.title || 'Unknown Title',
            scrapeResult: newValue.scrapeResult,
            config: newValue.currentScrapeConfig || {
              mainSelector: '',
              columns: [{ name: 'Text', selector: '.' }],
            },
          }

          setAllTabsData((prev) => {
            const existingIndex = prev.findIndex((tabData) => tabData.tabId === tabId)
            let newTabs: TabData[]
            if (existingIndex >= 0) {
              // Update existing tab
              newTabs = [...prev]
              newTabs[existingIndex] = updatedTabData
            } else {
              // Add new tab
              newTabs = [...prev, updatedTabData]
            }

            // If there's no current tab selected and this is the first/only tab, select it
            if (currentTabId === null && newTabs.length === 1) {
              setCurrentTabId(updatedTabData.tabId)
              setCurrentTabData(updatedTabData)
              // Update URL
              navigate({
                to: '/data/$tabId',
                params: { tabId: updatedTabData.tabId.toString() },
              })
            } else if (currentTabId === null && newTabs.length > 1 && prev.length === 0) {
              // If we had no tabs before and now have multiple, select the first one
              const firstTab = newTabs[0]
              setCurrentTabId(firstTab.tabId)
              setCurrentTabData(firstTab)
              // Update URL
              navigate({
                to: '/data/$tabId',
                params: { tabId: firstTab.tabId.toString() },
              })
            }

            return newTabs
          })

          // If this is the current tab, update current data too
          if (currentTabId === tabId) {
            setCurrentTabData(updatedTabData)
          }
        }
      })
      return unwatch
    }

    // Create storage watchers for each tab we know about
    const setupWatchers = async () => {
      const tabs = await browser.tabs.query({})
      for (const tab of tabs) {
        if (!tab.id) continue
        const unwatch = setupSingleTabWatcher(tab.id)
        unwatchCallbacks.push(unwatch)
      }
    }

    setupWatchers().catch(log.error)

    // Listen for new tabs being created to set up watchers for them
    const handleTabCreated = (tab: Browser.tabs.Tab) => {
      if (tab.id) {
        const unwatch = setupSingleTabWatcher(tab.id)
        unwatchCallbacks.push(unwatch)
      }
    }

    // Listen for tab removal
    const handleTabRemoved = (tabId: number) => {
      setAllTabsData((prev) => {
        const filtered = prev.filter((tabData) => tabData.tabId !== tabId)
        // If this was the current tab and there are other tabs, switch to first available
        if (currentTabId === tabId && filtered.length > 0) {
          const newTab = filtered[0]
          setCurrentTabId(newTab.tabId)
          setCurrentTabData(newTab)
          // Update URL
          navigate({
            to: '/data/$tabId',
            params: { tabId: newTab.tabId.toString() },
          })
        } else if (currentTabId === tabId) {
          // No other tabs available
          setCurrentTabId(null)
          setCurrentTabData(null)
        }
        return filtered
      })
    }

    browser.tabs.onCreated.addListener(handleTabCreated)
    browser.tabs.onRemoved.addListener(handleTabRemoved)

    return () => {
      // Clean up all watchers
      unwatchCallbacks.forEach((unwatch) => unwatch())
      browser.tabs.onCreated.removeListener(handleTabCreated)
      browser.tabs.onRemoved.removeListener(handleTabRemoved)
    }
  }, [currentTabId, navigate])

  // Handle tab switching
  const handleTabSwitch = (tabId: number) => {
    const tabData = allTabsData.find((data) => data.tabId === tabId)
    if (tabData) {
      setCurrentTabId(tabId)
      setCurrentTabData(tabData)
      // Reset selected rows when switching tabs
      setSelectedRows([])
      // Update URL
      navigate({
        to: '/data/$tabId',
        params: { tabId: tabId.toString() },
      })

      // Track tab switch
      trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_TAB_SWITCH, {
        total_tabs_available: allTabsData.length,
      })
    }
  }

  // Handle going back to original tab
  const handleBackToTab = async () => {
    if (currentTabId) {
      try {
        // Track the back to tab action
        trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_BACK_TO_TAB)

        await browser.tabs.update(currentTabId, { active: true })

        // Reopen the sidepanel for the original tab
        try {
          await browser.sidePanel.open({ tabId: currentTabId })
          log.debug(`Sidepanel reopened for tab ${currentTabId}`)
        } catch (sidePanelError) {
          log.warn('Failed to reopen sidepanel:', sidePanelError)
          // Don't show error to user as this is not critical
        }

        // Close this tab
        const currentTab = await browser.tabs.getCurrent()
        if (currentTab?.id) {
          await browser.tabs.remove(currentTab.id)
        }
      } catch (err) {
        toast.error('Failed to switch back to tab')
      }
    }
  }

  // Handle row highlight request - activates tab first, then highlights element
  const handleRowHighlight = async (selector: string, tabId: number) => {
    try {
      // First, activate the tab to bring it to focus
      await browser.tabs.update(tabId, { active: true })

      // Then send the highlight message to the content script
      browser.tabs.sendMessage(
        tabId,
        {
          type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT,
          payload: { selector },
        },
        (response) => {
          if (!response && browser.runtime.lastError) {
            toast.error(
              'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.',
            )
          }
        },
      )
    } catch (err) {
      toast.error('Failed to activate tab for highlighting')
    }
  }

  // Loading state
  if (loading) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Toaster />
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="text-lg">Loading data...</div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Error state
  if (error) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Toaster />
          <ConsentWrapper>
            <div className="flex items-center justify-center h-screen">
              <Card className="w-96">
                <CardHeader>
                  <CardTitle className="text-red-600">Error</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{error}</p>
                  <Button onClick={() => loadTabsData()} className="mt-4">
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </div>
          </ConsentWrapper>
          <Footer />
        </div>
      </TooltipProvider>
    )
  }

  // No data state
  if (allTabsData.length === 0) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Toaster />
          <ConsentWrapper>
            <div className="flex items-center justify-center h-screen">
              <Card className="w-96">
                <CardHeader>
                  <CardTitle>No Data Available</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>No scraped data found in any tabs. Please scrape some data first.</p>
                </CardContent>
              </Card>
            </div>
          </ConsentWrapper>
          <Footer />
        </div>
      </TooltipProvider>
    )
  }

  // Main view
  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex flex-col">
        <Toaster />
        <ConsentWrapper>
          <AppHeader
            left={
              <Button variant="outline" size="sm" onClick={handleBackToTab}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tab
              </Button>
            }
            center={
              /* Tab/Website selector combobox */
              <Popover open={isTabSelectorOpen} onOpenChange={setIsTabSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto text-left justify-start w-[33.6rem] max-w-[33.6rem]"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex flex-col items-start min-w-0 flex-1">
                        <div className="font-semibold truncate max-w-md ph_hidden">
                          {currentTabData?.tabTitle || 'Select Tab'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-md ph_hidden">
                          {currentTabData?.tabUrl || ''}
                        </div>
                      </div>
                      {currentTabData && (
                        <div className="text-xs text-muted-foreground ml-2 shrink-0">
                          {currentTabData.scrapeResult.data.length} rows
                        </div>
                      )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[33.6rem]" align="center">
                  <Command
                    filter={(value, search) => {
                      const tabData = allTabsData.find((tab) => tab.tabId.toString() === value)
                      if (!tabData) return 0
                      const searchTerm = search.toLowerCase()
                      const titleMatch = (tabData.tabTitle || '').toLowerCase().includes(searchTerm)
                      const urlMatch = (tabData.tabUrl || '').toLowerCase().includes(searchTerm)
                      return titleMatch || urlMatch ? 1 : 0
                    }}
                  >
                    <CommandInput
                      placeholder="Search tabs..."
                      value={tabSearch}
                      onValueChange={setTabSearch}
                      autoFocus
                      className="ph_hidden"
                    />
                    <CommandList>
                      <CommandEmpty>No tabs found</CommandEmpty>
                      {allTabsData.map((tabData) => (
                        <CommandItem
                          key={tabData.tabId}
                          value={tabData.tabId.toString()}
                          onSelect={() => {
                            handleTabSwitch(tabData.tabId)
                            setIsTabSelectorOpen(false)
                            setTabSearch('')
                          }}
                          className="flex items-center justify-between py-3"
                        >
                          <div className="flex flex-col items-start min-w-0 flex-1">
                            <div className="font-medium truncate w-full ph_hidden">
                              {tabData.tabTitle || 'Unknown Title'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate w-full ph_hidden">
                              {tabData.tabUrl}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground ml-2 shrink-0">
                            {tabData.scrapeResult.data.length} rows
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            }
            right={
              /* Export buttons */
              currentTabData && (
                <ExportButtons
                  scrapeResult={currentTabData.scrapeResult}
                  config={currentTabData.config}
                  showEmptyRows={false}
                  selectedRows={selectedRows}
                  filename={`${currentTabData.tabTitle || 'Data Export'} - ${new Date().toISOString().split('T')[0]}`}
                  size="sm"
                  variant="outline"
                />
              )
            }
          />

          {/* Main content */}
          <main className="flex-1 overflow-y-auto container mx-auto px-4 py-6">
            {currentTabData && (
              <ResultsTable
                data={currentTabData.scrapeResult.data}
                config={currentTabData.config}
                columnOrder={currentTabData.scrapeResult.columnOrder}
                showEmptyRowsToggle={true}
                onRowHighlight={handleRowHighlight}
                tabId={currentTabData.tabId}
                eventPrefix="FULL_DATA_VIEW"
                onSelectedRowsChange={setSelectedRows}
              />
            )}
          </main>
        </ConsentWrapper>
        <Footer />
      </div>
    </TooltipProvider>
  )
}

export default DataViewPage
