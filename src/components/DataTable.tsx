import { Button } from '@/components/ui/button'
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
import { getColumnKeys } from '@/utils/getColumnKeys'
import { rowToTsv } from '@/utils/tsv'
import {
  CellContext,
  ColumnDef,
  ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Clipboard, Expand, Highlighter } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onRowHighlight: (selector: string) => void
  columnOrder?: string[]
  showEmptyRows: boolean
  onShowEmptyRowsChange?: (show: boolean) => void
  tabId?: number | null
}

const DataTable: React.FC<DataTableProps> = ({
  data,
  config,
  onRowHighlight,
  columnOrder,
  showEmptyRows = false,
  onShowEmptyRowsChange,
  tabId,
}) => {
  // Use columnOrder if provided, otherwise fallback to config.columns order
  const columnsOrder =
    columnOrder && columnOrder.length > 0 ? columnOrder : config.columns.map((col) => col.name)

  // Pagination state
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  // Column sizing state
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  // Filter data based on showEmptyRows toggle
  const filteredData = useMemo(() => {
    return showEmptyRows ? data : data.filter((row) => !row.metadata.isEmpty)
  }, [data, showEmptyRows])

  // Create a stable key for anchor positioning that changes when data structure changes
  const anchorKey = useMemo(() => {
    return `${filteredData.length}-${pagination.pageSize}-${showEmptyRows}`
  }, [filteredData.length, pagination.pageSize, showEmptyRows])

  // Reset pagination when data changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [filteredData])

  // Calculate optimal column widths based on content
  const calculateOptimalColumnWidth = useCallback(
    (columnId: string, data: ScrapedRow[], config: ScrapeConfig): number => {
      if (columnId === 'rowIndex') return 40
      if (columnId === 'actions') return 60

      // Find the column configuration
      const columnIndex = config.columns.findIndex((col) => col.name === columnId)
      if (columnIndex === -1) return 150

      // Sample up to 50 rows for performance (smaller sample for sidepanel)
      const sampleSize = Math.min(50, data.length)
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
      // Average character width is about 7px for smaller UI
      const charWidth = 7
      const padding = 20 // Account for cell padding
      const calculatedWidth = Math.min(Math.max(maxLength * charWidth + padding, 80), 300)

      return calculatedWidth
    },
    [],
  )

  // Build columns for TanStack Table
  const columns = useMemo<ColumnDef<ScrapedRow>[]>(() => {
    const baseColumns: ColumnDef<ScrapedRow>[] = [
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
          // Find the index of this row in the filtered data
          const rowData = row.original
          const indexInFilteredData = filteredData.findIndex((item) => item === rowData)
          return indexInFilteredData + 1
        },
        size: 40,
        minSize: 40,
        maxSize: 60,
        enableResizing: false,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
          // Use the original index for highlighting
          const originalIndex = row.original.metadata.originalIndex
          const isEmpty = row.original.metadata.isEmpty

          // Highlight button
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
                      onRowHighlight(rowSelector)
                    }
              }
            >
              <Highlighter className="size-4" />
            </Button>
          )

          // Copy row button
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
                      const columnKeys = getColumnKeys(columnsOrder, config.columns)
                      const tsvContent = rowToTsv(row.original, columnKeys)
                      try {
                        await navigator.clipboard.writeText(tsvContent)
                        toast.success('Copied row to clipboard')
                        trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
                          rows_copied: 1,
                          columns_count: columnKeys.length,
                          export_type: 'data_table_row',
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

          // If row is empty, just render buttons without tooltips
          if (isEmpty) {
            return (
              <div className="flex gap-1">
                {highlightButton}
                {copyButton}
              </div>
            )
          }

          // Wrap each button with its tooltip for non-empty rows
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
        size: 60,
        minSize: 60,
        maxSize: 80,
        enableResizing: false,
      },
      ...columnsOrder.map((colName, index): ColumnDef<ScrapedRow> => {
        const optimalWidth = calculateOptimalColumnWidth(colName, filteredData, config)
        return {
          accessorKey: colName,
          header: colName,
          cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
            const dataKey = config.columns[index]?.key || colName
            const value = row.original.data[dataKey] || ''
            return (
              <div className="min-w-0 truncate" title={value}>
                {value && value.length > 100 ? `${value.substring(0, 100)}...` : value}
              </div>
            )
          },
          size: optimalWidth,
          minSize: 60,
          maxSize: 400,
          enableResizing: true,
        }
      }),
    ]
    return baseColumns
  }, [columnsOrder, config, onRowHighlight, filteredData, calculateOptimalColumnWidth])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    defaultColumn: {
      size: 150,
      minSize: 60,
      maxSize: 400,
    },
    manualPagination: false,
    manualSorting: false,
    manualFiltering: false,
    state: {
      pagination,
      columnSizing,
    },
    onPaginationChange: setPagination,
    onColumnSizingChange: setColumnSizing,
    pageCount: Math.ceil(filteredData.length / pagination.pageSize),
    getPaginationRowModel: undefined, // use built-in client-side pagination
  })

  // Get paginated rows manually (since getPaginationRowModel is undefined)
  const paginatedRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    const end = start + pagination.pageSize
    return table.getRowModel().rows.slice(start, end)
  }, [table, pagination])

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pagination.pageSize))

  // Handle opening full data view
  const handleOpenFullView = () => {
    if (tabId) {
      // Use type assertion since WXT will generate this entrypoint
      const fullViewUrl = browser.runtime.getURL(`/full-data-view.html?tabId=${tabId}` as any)
      browser.tabs.create({ url: fullViewUrl })

      // Close the sidepanel window after opening the full view
      window.close()
    }
  }

  return (
    <div className="data-table-container relative group">
      {/* Toggle for showing/hiding empty rows */}
      <div className="flex items-center justify-between [&>*:only-child]:ml-auto mb-4">
        {data.filter((r) => r.metadata.isEmpty).length > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <Switch
                id="show-empty-rows"
                checked={showEmptyRows}
                onCheckedChange={onShowEmptyRowsChange}
              />
              <label htmlFor="show-empty-rows" className="text-sm font-medium">
                Show {data.filter((r) => r.metadata.isEmpty).length} empty rows
              </label>
            </div>

            <div className="text-sm text-muted-foreground">
              {showEmptyRows
                ? `${filteredData.length} total rows`
                : `${filteredData.length} rows with data`}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">{filteredData.length} rows with data</div>
        )}
      </div>

      <Table
        key={columnsOrder.join('-')}
        className="anchor/data-table"
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
                  className={header.id === 'rowIndex' || header.id === 'actions' ? '' : 'ph_hidden'}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
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
          {paginatedRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                No data
              </TableCell>
            </TableRow>
          ) : (
            paginatedRows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={row.original.metadata.isEmpty ? 'opacity-60 bg-muted/30' : ''}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    style={{
                      width: `${cell.column.getSize()}px`,
                    }}
                    className={
                      cell.column.id === 'rowIndex' || cell.column.id === 'actions'
                        ? ''
                        : 'ph_hidden'
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

      {/* Pagination Controls */}
      <div className="relative flex items-center justify-center gap-2 mt-4">
        {/* Only show pagination navigation when there are more rows than page size */}
        {filteredData.length > pagination.pageSize && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                trackEvent(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESS, {
                  direction: 'prev',
                  from_page: pagination.pageIndex + 1,
                  to_page: pagination.pageIndex,
                  total_pages: totalPages,
                })
                setPagination((p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))
              }}
              disabled={pagination.pageIndex === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.pageIndex + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                trackEvent(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESS, {
                  direction: 'next',
                  from_page: pagination.pageIndex + 1,
                  to_page: pagination.pageIndex + 2,
                  total_pages: totalPages,
                })
                setPagination((p) => ({
                  ...p,
                  pageIndex: Math.min(totalPages - 1, p.pageIndex + 1),
                }))
              }}
              disabled={pagination.pageIndex >= totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* Floating expand button with anchor positioning */}
      {tabId && (
        <Tooltip key={`floating-button-${anchorKey}`}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenFullView}
              className="
                right-4
                fixed z-50
                anchored/data-table
                anchored-bottom-end
                try-[--avoid-footer,--fallback-bottom]
                anchored-visible-no-overflow
                opacity-0 group-hover:opacity-100
                transition-opacity duration-200
                [view-transition-name:none]
                right-anchor-end-4
              "
              aria-label="Open in full view"
            >
              <Expand className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in full view</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export default DataTable
