import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toaster } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { reportingListener, reportRejection } from '@/utils/report-rejection'

import {
  collectTabsWithData,
  parseRequestedTabId,
  resolveTabSelection,
  type TabData,
  visibleRows,
} from '@/entrypoints/full-data-view/tab-data'
import { calculateOptimalColumnWidth, FULL_DATA_VIEW_COLUMN_METRICS } from '@/utils/column-width'
import {
  type CellContext,
  type ColumnDef,
  columnFilteringFeature,
  type ColumnFiltersState,
  columnResizingFeature,
  columnSizingFeature,
  type ColumnSizingState,
  columnVisibilityFeature,
  type ColumnVisibilityState,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import log from 'loglevel'
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clipboard,
  Highlighter,
  Search,
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

// v9 features are opt-in. The full data view uses sorting, column + global
// filtering, pagination, row selection, column visibility and column resizing,
// so each of those features is registered together with the row models and
// named filter/sort functions it depends on.
const fullDataViewFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  globalFilteringFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  // `sortFn: 'auto'` (the default) resolves to one of these for string values.
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
})

type FullDataViewFeatures = typeof fullDataViewFeatures

export const FullDataViewApp: React.FC = () => {
  // URL parsing
  const initialTabId = parseRequestedTabId(window.location.search)

  // State
  const [currentTabId, setCurrentTabId] = useState<number | null>(initialTabId)
  const [allTabsData, setAllTabsData] = useState<TabData[]>([])
  const [currentTabData, setCurrentTabData] = useState<TabData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isShowEmptyRowsChecked, setIsShowEmptyRowsChecked] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  // A search never matches an empty row, so a running one both hides the toggle
  // and overrides it, rather than silently switching the reader's choice off.
  const shouldShowEmptyRows = globalFilter.length === 0 && isShowEmptyRowsChecked
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  // Pagination state
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  // Tab selector state
  const [isTabSelectorOpen, setIsTabSelectorOpen] = useState(false)
  const [tabSearch, setTabSearch] = useState('')

  // Bumped by the Retry button to ask for the scan again on a tab id that has
  // not changed.
  const [reloadRequest, setReloadRequest] = useState(0)

  // Scans every tab for stored data on mount, whenever the shown tab changes,
  // and on a retry. The loader lives in here rather than in a `useCallback`, so
  // none of its state updates is reachable synchronously from the effect; and
  // nothing needs setting before the first await, since `isLoading` starts true
  // and a re-scan behind an open table has no reason to blank it.
  useEffect(() => {
    const loadTabsData = async () => {
      try {
        const tabsWithData = await collectTabsWithData(await browser.tabs.query({}), (tabId) =>
          storage.getItem<SidePanelConfig>(`session:sidepanel_config_${tabId}`),
        )

        setAllTabsData(tabsWithData)
        setError(null)

        const selection = resolveTabSelection(tabsWithData, currentTabId)
        setCurrentTabId(selection.tabId)
        setCurrentTabData(selection.data)
      } catch (err) {
        setError('Failed to load tab data: ' + (err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }

    reportRejection(loadTabsData())
  }, [currentTabId, reloadRequest])

  useEffect(() => {
    reportRejection(
      storage.getItem<boolean>('local:debugMode').then((val) => {
        if (isDevOrTest) {
          log.setLevel('trace')
        } else {
          log.setLevel(val ? 'trace' : 'error')
        }
      }),
    )

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
      const unwatch = storage.watch<SidePanelConfig>(
        `session:${sessionKey}`,
        reportingListener(async (newValue) => {
          // Update only the specific tab that changed, preserve user's current selection
          const tabInfo = await browser.tabs.get(tabId).catch(() => null)
          if (!tabInfo) return

          if (!newValue?.scrapeResult?.data || newValue.scrapeResult.data.length === 0) {
            // Data was removed - remove this tab from our list
            setAllTabsData((prev) => {
              const filtered = prev.filter((tabData) => tabData.tabId !== tabId)
              // If this was the current tab and there are other tabs, switch to first available
              const [newTab] = filtered
              if (currentTabId === tabId && newTab) {
                setCurrentTabId(newTab.tabId)
                setCurrentTabData(newTab)
                // Update URL
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.set('tabId', newTab.tabId.toString())
                window.history.replaceState({}, '', newUrl.toString())
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

              // If there's no current tab selected and this is the first/only tab, select it.
              // This update either replaces an entry or appends one, so an empty
              // `prev` can only ever become a list of one.
              if (currentTabId === null && newTabs.length === 1) {
                setCurrentTabId(updatedTabData.tabId)
                setCurrentTabData(updatedTabData)
                // Update URL
                const newUrl = new URL(window.location.href)
                newUrl.searchParams.set('tabId', updatedTabData.tabId.toString())
                window.history.replaceState({}, '', newUrl.toString())
              }

              return newTabs
            })

            // If this is the current tab, update current data too
            if (currentTabId === tabId) {
              setCurrentTabData(updatedTabData)
            }
          }
        }),
      )
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
        const [newTab] = filtered
        if (currentTabId === tabId && newTab) {
          setCurrentTabId(newTab.tabId)
          setCurrentTabData(newTab)
          // Update URL
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.set('tabId', newTab.tabId.toString())
          window.history.replaceState({}, '', newUrl.toString())
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
  }, [currentTabId])

  // Handle tab switching. Only the tab list calls this, with an id it read
  // straight out of `allTabsData`.
  const handleTabSwitch = (tabId: number) => {
    const tabData = allTabsData.find((data) => data.tabId === tabId)!

    setCurrentTabId(tabId)
    setCurrentTabData(tabData)
    // Update URL
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('tabId', tabId.toString())
    window.history.replaceState({}, '', newUrl.toString())
    // Reset pagination, filters, row selection, and column sizing
    setPagination({ pageIndex: 0, pageSize: 20 })
    setGlobalFilter('')
    setSorting([])
    setColumnFilters([])
    setRowSelection({})
    setColumnSizing({})

    // Track tab switch
    trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_TAB_SWITCH, {
      total_tabs_available: allTabsData.length,
    })
  }

  // Handle going back to original tab. The header this button sits in only
  // renders once at least one tab has data, and a tab is only ever deselected
  // by the same change that empties that list.
  const handleBackToTab = async () => {
    try {
      // Track the back to tab action
      trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_BACK_TO_TAB)

      await browser.tabs.update(currentTabId!, { active: true })

      // Reopen the sidepanel for the original tab
      try {
        await browser.sidePanel.open({ tabId: currentTabId! })
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
    } catch {
      toast.error('Failed to switch back to tab')
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
    } catch {
      toast.error('Failed to activate tab for highlighting')
    }
  }

  const filteredData = useMemo(
    () =>
      currentTabData ? visibleRows(currentTabData.scrapeResult.data, shouldShowEmptyRows) : [],
    [currentTabData, shouldShowEmptyRows],
  )

  // Build columns for TanStack Table with enhanced features
  const columns = useMemo<ColumnDef<FullDataViewFeatures, ScrapedRow>[]>(() => {
    if (!currentTabData) return []

    const columnsOrder =
      currentTabData.scrapeResult.columnOrder && currentTabData.scrapeResult.columnOrder.length > 0
        ? currentTabData.scrapeResult.columnOrder
        : currentTabData.config.columns.map((col) => col.name)

    const baseColumns: ColumnDef<FullDataViewFeatures, ScrapedRow>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value: boolean) => {
              table.toggleAllPageRowsSelected(!!value)

              // Track select all action
              trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_ROW_SELECTION, {
                selection_type: value ? 'select_all' : 'deselect_all',
                rows_affected: table.getRowModel().rows.length,
                total_rows: filteredData.length,
              })
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row, table }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean) => {
              row.toggleSelected(!!value)

              // Track individual row selection
              trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_ROW_SELECTION, {
                selection_type: value ? 'select_individual' : 'deselect_individual',
                is_empty_row: row.original.metadata.isEmpty,
                total_selected: table.getSelectedRowModel().rows.length + (value ? 1 : -1),
              })
            }}
            aria-label="Select row"
          />
        ),
        size: 35,
        minSize: 35,
        maxSize: 35,
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        enableResizing: false,
      },
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }: CellContext<FullDataViewFeatures, ScrapedRow>) => {
          const rowData = row.original
          const indexInFilteredData = filteredData.findIndex((item) => item === rowData)
          return indexInFilteredData + 1
        },
        size: 35,
        minSize: 35,
        maxSize: 60,
        enableSorting: false,
        enableGlobalFilter: false,
        enableResizing: false,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: CellContext<FullDataViewFeatures, ScrapedRow>) => {
          const isEmpty = row.original.metadata.isEmpty
          const originalIndex = row.original.metadata.originalIndex
          const columnKeys = getColumnKeys(columnsOrder, currentTabData.config.columns)

          const highlightButton = (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={isEmpty ? undefined : 'Highlight this element'}
              disabled={isEmpty}
              onClick={
                isEmpty
                  ? undefined
                  : () => {
                      const rowSelector = `(${currentTabData.config.mainSelector})[${originalIndex + 1}]`
                      reportRejection(handleRowHighlight(rowSelector, currentTabData.tabId))
                    }
              }
            >
              <Highlighter className="size-4" />
            </Button>
          )

          const copyRow = async () => {
            const tsvContent = rowToTsv(row.original, columnKeys)
            try {
              await navigator.clipboard.writeText(tsvContent)
              toast.success('Copied row to clipboard')
              trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
                rows_copied: 1,
                columns_count: columnKeys.length,
                export_type: 'full_data_view_row',
              })
            } catch {
              toast.error('Failed to copy')
              trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
            }
          }

          const copyButton = (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={isEmpty ? undefined : 'Copy this row'}
              disabled={isEmpty}
              onClick={isEmpty ? undefined : () => reportRejection(copyRow())}
            >
              <Clipboard className="size-4" />
            </Button>
          )

          if (isEmpty) {
            return (
              <div className="flex gap-1">
                {highlightButton}
                {copyButton}
              </div>
            )
          }

          return (
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>{highlightButton}</TooltipTrigger>
                <TooltipContent>Highlight this element</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>{copyButton}</TooltipTrigger>
                <TooltipContent>Copy this row</TooltipContent>
              </Tooltip>
            </div>
          )
        },
        size: 75,
        minSize: 75,
        maxSize: 100,
        enableSorting: false,
        enableGlobalFilter: false,
        enableResizing: false,
      },
      ...columnsOrder.map((colName, index): ColumnDef<FullDataViewFeatures, ScrapedRow> => {
        const optimalWidth = calculateOptimalColumnWidth(
          colName,
          filteredData,
          currentTabData.config,
          FULL_DATA_VIEW_COLUMN_METRICS,
        )
        return {
          id: colName,
          accessorFn: (row: ScrapedRow) => {
            const dataKey = currentTabData.config.columns[index]?.key || colName
            return row.data[dataKey] || ''
          },
          header: colName,
          cell: ({ row }: CellContext<FullDataViewFeatures, ScrapedRow>) => {
            const dataKey = currentTabData.config.columns[index]?.key || colName
            const value = row.original.data[dataKey] || ''
            return (
              <div className="min-w-0 truncate" title={value}>
                {value}
              </div>
            )
          },
          size: optimalWidth,
          minSize: 80,
          maxSize: 600,
          filterFn: 'includesString',
          enableColumnFilter: true,
          enableGlobalFilter: true,
          enableResizing: true,
        }
      }),
    ]
    return baseColumns
  }, [currentTabData, filteredData])

  const table = useTable({
    features: fullDataViewFeatures,
    data: filteredData,
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    defaultColumn: {
      size: 200,
      minSize: 80,
      maxSize: 600,
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      columnVisibility,
      rowSelection,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: setColumnSizing,
    globalFilterFn: 'includesString',
  })

  // `useTable` hands back a new object every render, so the effect below counts
  // the rows here and depends on the count instead — otherwise every render
  // would restart the debounce.
  const filteredRowCount = table.getFilteredRowModel().rows.length

  // Track search usage with debouncing
  useEffect(() => {
    if (globalFilter.length === 0) return

    const timeoutId = setTimeout(() => {
      trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_SEARCH, {
        search_term_length: globalFilter.length,
        filtered_rows: filteredRowCount,
        // A search can only be typed from the main view, which has a tab.
        total_rows: currentTabData!.scrapeResult.data.length,
      })
    }, 1000) // Debounce for 1 second

    return () => clearTimeout(timeoutId)
  }, [globalFilter, currentTabData, filteredRowCount])

  // Loading state
  if (isLoading) {
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
                  <Button
                    onClick={() => {
                      setIsLoading(true)
                      setReloadRequest((request) => request + 1)
                    }}
                    className="mt-4"
                  >
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

  // Past the guards above there is always a tab on show: the selection and the
  // list of tabs with data are only ever set together.
  const shownTab = currentTabData!

  // Main view
  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex flex-col">
        <Toaster />
        <ConsentWrapper>
          {/* Header */}
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 py-4">
              <div className="grid grid-cols-[1fr_auto_1fr]">
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reportRejection(handleBackToTab())}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Tab
                  </Button>
                </div>

                {/* Tab/Website selector combobox */}
                <Popover open={isTabSelectorOpen} onOpenChange={setIsTabSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-auto text-left justify-start w-[33.6rem] max-w-[33.6rem]"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col items-start min-w-0 flex-1">
                          <div className="font-semibold truncate max-w-md ph_hidden">
                            {shownTab.tabTitle}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-md ph_hidden">
                            {shownTab.tabUrl}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground ml-2 shrink-0">
                          {shownTab.scrapeResult.data.length} rows
                        </div>
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[33.6rem]" align="center">
                    <Command
                      filter={(value, search) => {
                        // cmdk only ever filters values this list rendered.
                        const tabData = allTabsData.find((tab) => tab.tabId.toString() === value)!
                        const searchTerm = search.toLowerCase()
                        const hasTitleMatch = tabData.tabTitle.toLowerCase().includes(searchTerm)
                        const hasUrlMatch = tabData.tabUrl.toLowerCase().includes(searchTerm)
                        return hasTitleMatch || hasUrlMatch ? 1 : 0
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
                                {tabData.tabTitle}
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

                <div className="flex items-center justify-end">
                  {/* Export buttons */}
                  <ExportButtons
                    scrapeResult={shownTab.scrapeResult}
                    config={shownTab.config}
                    showEmptyRows={shouldShowEmptyRows}
                    selectedRows={table
                      .getFilteredSelectedRowModel()
                      .rows.map((row) => row.original)}
                    filename={`${shownTab.tabTitle} - ${new Date().toISOString().split('T')[0]}`}
                    size="sm"
                    variant="outline"
                  />
                </div>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto container mx-auto px-4 py-6">
            {/* Controls */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center mb-6">
              {/* Left: Row selection info */}
              {table.getFilteredSelectedRowModel().rows.length > 0 && (
                <div className="col-span-1 justify-self-start">
                  <div className="text-sm text-muted-foreground">
                    {table.getFilteredSelectedRowModel().rows.length} of{' '}
                    {table.getFilteredRowModel().rows.length} rows selected
                  </div>
                </div>
              )}

              {/* Center: Global search */}
              <div className="col-start-2 justify-self-center">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search all columns..."
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-8 w-64 ph_hidden"
                  />
                </div>
              </div>

              {/* Right: Row controls and info */}
              <div className="col-start-3 grid grid-cols-[1fr_auto_1fr] items-center">
                {/* Show empty rows control - only show if there are empty rows AND no global filter is active */}
                {shownTab.scrapeResult.data.filter((r) => r.metadata.isEmpty).length > 0 &&
                  !globalFilter && (
                    <div className="col-start-2 flex items-center gap-2">
                      <Switch
                        id="show-empty-rows"
                        checked={shouldShowEmptyRows}
                        onCheckedChange={setIsShowEmptyRowsChecked}
                      />
                      <label
                        htmlFor="show-empty-rows"
                        className="text-sm font-medium whitespace-nowrap"
                      >
                        Show {shownTab.scrapeResult.data.filter((r) => r.metadata.isEmpty).length}{' '}
                        empty rows
                      </label>
                    </div>
                  )}

                {/* Row count info */}
                <div className="col-start-3 text-sm text-muted-foreground text-right">
                  {globalFilter
                    ? `${table.getFilteredRowModel().rows.length} filtered rows`
                    : shouldShowEmptyRows
                      ? `${table.getFilteredRowModel().rows.length} total rows`
                      : `${table.getFilteredRowModel().rows.length} rows with data`}
                </div>
              </div>
            </div>

            {/* Data table */}
            <div className="border rounded-lg overflow-auto">
              <Table
                key={shownTab.tabId}
                className="w-full table-fixed"
                style={{
                  width: table.getCenterTotalSize(),
                }}
              >
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{
                            width: `${header.getSize()}px`,
                            position: 'relative',
                          }}
                          className={
                            header.id === 'select'
                              ? 'px-3'
                              : header.id === 'rowIndex' || header.id === 'actions'
                                ? ''
                                : 'cursor-pointer select-none ph_hidden'
                          }
                          onClick={
                            header.column.getCanSort()
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-2">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          {/* Column resize handle */}
                          {header.column.getCanResize() && (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              className={`absolute top-0 right-0 h-full w-1 bg-border cursor-col-resize select-none touch-none hover:bg-primary/50 ${
                                header.column.getIsResizing()
                                  ? 'bg-primary opacity-100'
                                  : 'opacity-0 hover:opacity-100'
                              }`}
                            />
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="text-center text-muted-foreground h-24"
                      >
                        No data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className={row.original.metadata.isEmpty ? 'opacity-60 bg-muted/30' : ''}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            style={{
                              width: `${cell.column.getSize()}px`,
                            }}
                            className={
                              cell.column.id === 'select'
                                ? 'px-3'
                                : cell.column.id === 'rowIndex' || cell.column.id === 'actions'
                                  ? 'px-2'
                                  : 'px-3 ph_hidden'
                            }
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination controls */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center mt-4">
              {/* Left: Rows per page selector - always visible */}
              <div className="col-span-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows per page:</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-auto px-3">
                      {table.state.pagination.pageSize}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuRadioGroup
                      value={table.state.pagination.pageSize.toString()}
                      onValueChange={(value) => {
                        const previousPageSize = table.state.pagination.pageSize
                        const newPageSize = parseInt(value)
                        table.setPageSize(newPageSize)

                        // Track page size change
                        trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_PAGE_SIZE_CHANGE, {
                          previous_page_size: previousPageSize,
                          new_page_size: newPageSize,
                          total_rows: table.getFilteredRowModel().rows.length,
                        })
                      }}
                    >
                      <DropdownMenuRadioItem value="10">10</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="20">20</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="50">50</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="100">100</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="500">500</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="1000">1000</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Center: Navigation controls - only show if there are more rows than the current page size */}
              {table.getFilteredRowModel().rows.length > table.state.pagination.pageSize && (
                <div className="col-span-1 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Page info */}
                  <span className="text-sm text-muted-foreground px-2">
                    Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </main>
        </ConsentWrapper>
        <Footer />
      </div>
    </TooltipProvider>
  )
}
