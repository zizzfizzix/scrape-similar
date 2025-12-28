import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import {
  CellContext,
  ColumnDef,
  ColumnFiltersState,
  ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Highlighter,
  Search,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface ResultsTableProps {
  data: ScrapedRow[]
  config: ScrapeConfig
  columnOrder?: string[]
  showEmptyRowsToggle?: boolean // Whether to show the empty rows toggle
  onRowHighlight?: (selector: string, tabId: number) => void // Optional row highlight handler
  tabId?: number | null // Tab ID for row highlighting
  eventPrefix?: string // Prefix for analytics events (e.g., 'FULL_DATA_VIEW' or 'BATCH_SCRAPE')
  onSelectedRowsChange?: (selectedRows: ScrapedRow[]) => void // Callback for selected rows
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  data,
  config,
  columnOrder,
  showEmptyRowsToggle = false,
  onRowHighlight,
  tabId,
  eventPrefix = 'RESULTS_TABLE',
  onSelectedRowsChange,
}) => {
  // State
  const [showEmptyRows, setShowEmptyRows] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  // Reset showEmptyRows when global filter is applied
  useEffect(() => {
    if (globalFilter && globalFilter.length > 0) {
      setShowEmptyRows(false)
    }
  }, [globalFilter])

  // Filter data based on showEmptyRows toggle
  const filteredData = useMemo(() => {
    return showEmptyRows ? data : data.filter((row) => !row.metadata.isEmpty)
  }, [data, showEmptyRows])

  // Calculate optimal column widths
  const calculateOptimalColumnWidth = useCallback(
    (columnId: string, data: ScrapedRow[], config: ScrapeConfig): number => {
      if (columnId === 'select') return 35
      if (columnId === 'rowIndex') return 35
      if (columnId === 'actions') return 75

      // Find the column configuration
      const columnIndex = config.columns.findIndex((col) => col.name === columnId)
      if (columnIndex === -1) return 200

      // Sample up to 100 rows for performance
      const sampleSize = Math.min(100, data.length)
      const sampleData = data.slice(0, sampleSize)

      // Calculate max content length
      let maxLength = columnId.length // Start with header length

      for (const row of sampleData) {
        const dataKey = config.columns[columnIndex]?.key || columnId
        const value = row.data[dataKey] || ''
        const contentLength = String(value).length
        maxLength = Math.max(maxLength, contentLength)
      }

      // Convert character count to approximate pixel width
      const charWidth = 8
      const padding = 24
      const calculatedWidth = Math.min(Math.max(maxLength * charWidth + padding, 100), 400)

      return calculatedWidth
    },
    [],
  )

  // Helper to get column keys
  const getColumnKeys = useCallback(
    (columnsOrder: string[], configColumns: ScrapeConfig['columns']): string[] => {
      return columnsOrder.map((colName) => {
        const col = configColumns.find((c) => c.name === colName)
        return col?.key || colName
      })
    },
    [],
  )

  // Helper to convert row to TSV
  const rowToTsv = useCallback((row: ScrapedRow, columnKeys: string[]): string => {
    return columnKeys.map((key) => row.data[key] || '').join('\t')
  }, [])

  // Build columns
  const columns = useMemo<ColumnDef<ScrapedRow>[]>(() => {
    const columnsOrderToUse =
      columnOrder && columnOrder.length > 0 ? columnOrder : config.columns.map((col) => col.name)

    const baseColumns: ColumnDef<ScrapedRow>[] = [
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
              if (eventPrefix) {
                trackEvent(`${eventPrefix}_ROW_SELECTION` as any, {
                  selection_type: value ? 'select_all' : 'deselect_all',
                  rows_affected: table.getRowModel().rows.length,
                  total_rows: filteredData.length,
                })
              }
            }}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean) => {
              row.toggleSelected(!!value)
              if (eventPrefix) {
                trackEvent(`${eventPrefix}_ROW_SELECTION` as any, {
                  selection_type: value ? 'select_individual' : 'deselect_individual',
                  is_empty_row: row.original.metadata.isEmpty,
                  total_selected: table.getSelectedRowModel().rows.length + (value ? 1 : -1),
                })
              }
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
        cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
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
    ]

    // Add actions column only if onRowHighlight is provided
    if (onRowHighlight && tabId) {
      baseColumns.push({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
          const isEmpty = row.original.metadata.isEmpty
          const originalIndex = row.original.metadata.originalIndex
          const columnKeys = getColumnKeys(columnsOrderToUse, config.columns)

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
                      const rowSelector = `(${config.mainSelector})[${originalIndex + 1}]`
                      onRowHighlight(rowSelector, tabId)
                    }
              }
            >
              <Highlighter className="size-4" />
            </Button>
          )

          const copyButton = (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={isEmpty ? undefined : 'Copy this row'}
              disabled={isEmpty}
              onClick={
                isEmpty
                  ? undefined
                  : async () => {
                      const tsvContent = rowToTsv(row.original, columnKeys)
                      try {
                        await navigator.clipboard.writeText(tsvContent)
                        toast.success('Copied row to clipboard')
                        trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
                          rows_copied: 1,
                          columns_count: columnKeys.length,
                          export_type: `${eventPrefix.toLowerCase()}_row`,
                        })
                      } catch {
                        toast.error('Failed to copy')
                        trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
                      }
                    }
              }
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
      })
    }

    // Add data columns
    baseColumns.push(
      ...columnsOrderToUse.map((colName, index): ColumnDef<ScrapedRow> => {
        const optimalWidth = calculateOptimalColumnWidth(colName, filteredData, config)
        return {
          id: colName,
          accessorFn: (row: ScrapedRow) => {
            const dataKey = config.columns[index]?.key || colName
            return row.data[dataKey] || ''
          },
          header: colName,
          cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
            const dataKey = config.columns[index]?.key || colName
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
    )

    return baseColumns
  }, [
    config,
    columnOrder,
    filteredData,
    calculateOptimalColumnWidth,
    onRowHighlight,
    tabId,
    getColumnKeys,
    rowToTsv,
    eventPrefix,
  ])

  // Create table instance
  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
      columnVisibility,
      rowSelection,
      globalFilter,
      pagination,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: setColumnSizing,
  })

  const hasEmptyRows = data.filter((r) => r.metadata.isEmpty).length > 0

  // Notify parent of selected rows changes
  useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original)
      onSelectedRowsChange(selectedRows)
    }
  }, [rowSelection, onSelectedRowsChange, table])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
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
          {/* Show empty rows control */}
          {showEmptyRowsToggle && hasEmptyRows && !globalFilter && (
            <div className="col-start-2 flex items-center gap-2">
              <Switch
                id="show-empty-rows"
                checked={showEmptyRows}
                onCheckedChange={setShowEmptyRows}
              />
              <label htmlFor="show-empty-rows" className="text-sm font-medium whitespace-nowrap">
                Show {data.filter((r) => r.metadata.isEmpty).length} empty rows
              </label>
            </div>
          )}

          {/* Row count info */}
          <div className="col-start-3 text-sm text-muted-foreground text-right">
            {globalFilter
              ? `${table.getFilteredRowModel().rows.length} filtered rows`
              : showEmptyRows
                ? `${table.getFilteredRowModel().rows.length} total rows`
                : `${table.getFilteredRowModel().rows.length} rows with data`}
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="border rounded-lg overflow-auto">
        <Table
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
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center">
        {/* Left: Rows per page selector */}
        <div className="col-span-1 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-auto px-3">
                {table.getState().pagination.pageSize}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={table.getState().pagination.pageSize.toString()}
                onValueChange={(value) => {
                  const previousPageSize = table.getState().pagination.pageSize
                  const newPageSize = parseInt(value)
                  table.setPageSize(newPageSize)

                  if (eventPrefix) {
                    trackEvent(`${eventPrefix}_PAGE_SIZE_CHANGE` as any, {
                      previous_page_size: previousPageSize,
                      new_page_size: newPageSize,
                      total_rows: table.getFilteredRowModel().rows.length,
                    })
                  }
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
        {table.getFilteredRowModel().rows.length > table.getState().pagination.pageSize && (
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
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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
    </div>
  )
}

export default ResultsTable
