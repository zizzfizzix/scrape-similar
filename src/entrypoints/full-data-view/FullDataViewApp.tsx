import { AppHeader } from '@/components/AppHeader'
import ExportButtons from '@/components/ExportButtons'
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
import { liveGetJobUrlResults, liveGetSingleScrapeJobs } from '@/utils/scrape-db'
import { useLiveQuery } from 'dexie-react-hooks'
import log from 'loglevel'
import { ArrowLeft, ChevronsUpDown } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface TabData {
  tabId: number
  tabUrl: string
  tabTitle: string
  scrapeResult: ScrapeResult
  config: ScrapeConfig
  jobId?: string // ID in Dexie database
}

interface FullDataViewAppProps {}

const FullDataViewApp: React.FC<FullDataViewAppProps> = () => {
  // URL parsing
  const urlParams = new URLSearchParams(window.location.search)
  const initialTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId')!) : null

  // State
  const [currentTabId, setCurrentTabId] = useState<number | null>(initialTabId)
  const [currentTabData, setCurrentTabData] = useState<TabData | null>(null)
  const [selectedRows, setSelectedRows] = useState<ScrapedRow[]>([])

  // Tab selector state
  const [isTabSelectorOpen, setIsTabSelectorOpen] = useState(false)
  const [tabSearch, setTabSearch] = useState('')

  // Use Dexie live query to get all single scrape jobs
  const scrapeJobs = useLiveQuery(() => liveGetSingleScrapeJobs(), [])

  // Convert scrape jobs to TabData format
  const allTabsData: TabData[] = React.useMemo(() => {
    if (!scrapeJobs) return []

    return scrapeJobs
      .filter((job) => job.tabId && job.urls.length > 0)
      .map((job) => ({
        tabId: job.tabId!,
        tabUrl: job.urls[0],
        tabTitle: job.name,
        scrapeResult: { data: [], columnOrder: [] }, // Placeholder, will be loaded separately
        config: job.config,
        jobId: job.id,
      }))
  }, [scrapeJobs])

  // Get the current tab's job ID
  const currentJobId = React.useMemo(() => {
    if (!currentTabId) return null
    const tabData = allTabsData.find((t) => t.tabId === currentTabId)
    return tabData?.jobId || null
  }, [currentTabId, allTabsData])

  // Use live query to watch for changes to the current job's URL results
  const currentUrlResults = useLiveQuery(() => {
    if (!currentJobId) return Promise.resolve([] as ScrapeUrlResult[])
    return liveGetJobUrlResults(currentJobId)
  }, [currentJobId])

  // Loading state
  const loading = scrapeJobs === undefined

  // Update currentTabData when URL results change
  useEffect(() => {
    if (!currentTabId || !currentJobId) {
      setCurrentTabData(null)
      return
    }

    const tabData = allTabsData.find((t) => t.tabId === currentTabId)
    if (!tabData) {
      setCurrentTabData(null)
      return
    }

    if (currentUrlResults && currentUrlResults.length > 0 && currentUrlResults[0].result) {
      setCurrentTabData({
        ...tabData,
        scrapeResult: currentUrlResults[0].result,
      })
    } else {
      setCurrentTabData(tabData)
    }
  }, [currentTabId, currentJobId, allTabsData, currentUrlResults])

  // Set initial tab on mount
  useEffect(() => {
    if (allTabsData.length > 0 && !currentTabId) {
      setCurrentTabId(allTabsData[0].tabId)
    }
  }, [allTabsData, currentTabId])

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

  // Handle tab switching
  const handleTabSwitch = (tabId: number) => {
    const tabData = allTabsData.find((data) => data.tabId === tabId)
    if (tabData) {
      setCurrentTabId(tabId)
      setCurrentTabData(tabData)
      // Reset selected rows when switching tabs
      setSelectedRows([])
      // Update URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('tabId', tabId.toString())
      window.history.replaceState({}, '', newUrl.toString())

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

export default FullDataViewApp
