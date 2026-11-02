import { RowActionsCell } from '@/components/RowActionsCell'
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
import { calculateOptimalColumnWidth, SIDE_PANEL_COLUMN_METRICS } from '@/utils/column-width'
import { getColumnKeys } from '@/utils/getColumnKeys'
import { reportRejection } from '@/utils/report-rejection'
import {
  type CellContext,
  type ColumnDef,
  columnResizingFeature,
  columnSizingFeature,
  type ColumnSizingState,
  flexRender,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import React, { useId, useMemo, useState } from 'react'

// The side panel table only needs column sizing/resizing; pagination is handled
// with local component state and the rows are never sorted or filtered here.
const dataTableFeatures = tableFeatures({
  columnSizingFeature,
  columnResizingFeature,
})

type DataTableFeatures = typeof dataTableFeatures

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onRowHighlight: (selector: string) => void
  columnOrder?: string[]
  showEmptyRows: boolean
  onShowEmptyRowsChange?: (show: boolean) => void
  tabId?: number | null
}

export const DataTable: React.FC<DataTableProps> = ({
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

  // Every tab's panel keeps a table, so a fixed id would label another tab's switch.
  const showEmptyRowsId = useId()

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

  // Send the reader back to page 1 whenever the rows underneath them change.
  // Adjusting during render rather than from an effect keeps the table from
  // painting the old page index against the new rows first.
  const [previousFilteredData, setPreviousFilteredData] = useState(filteredData)
  if (previousFilteredData !== filteredData) {
    setPreviousFilteredData(filteredData)
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }

  // Build columns for TanStack Table
  const columns = useMemo<ColumnDef<DataTableFeatures, ScrapedRow>[]>(() => {
    const columnKeys = getColumnKeys(columnsOrder, config.columns)
    const baseColumns: ColumnDef<DataTableFeatures, ScrapedRow>[] = [
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }: CellContext<DataTableFeatures, ScrapedRow>) => {
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
        cell: ({ row }: CellContext<DataTableFeatures, ScrapedRow>) => (
          <RowActionsCell
            row={row.original}
            mainSelector={config.mainSelector}
            columnKeys={columnKeys}
            exportType={EXPORT_TYPES.DATA_TABLE_ROW}
            onHighlight={onRowHighlight}
          />
        ),
        size: 60,
        minSize: 60,
        maxSize: 80,
        enableResizing: false,
      },
      ...columnsOrder.map((colName, index): ColumnDef<DataTableFeatures, ScrapedRow> => {
        const optimalWidth = calculateOptimalColumnWidth(
          colName,
          filteredData,
          config,
          SIDE_PANEL_COLUMN_METRICS,
        )
        return {
          accessorKey: colName,
          header: colName,
          cell: ({ row }: CellContext<DataTableFeatures, ScrapedRow>) => {
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
  }, [columnsOrder, config, onRowHighlight, filteredData])

  const table = useTable({
    features: dataTableFeatures,
    data: filteredData,
    columns,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    columnResizeDirection: 'ltr',
    defaultColumn: {
      size: 150,
      minSize: 60,
      maxSize: 400,
    },
    state: {
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
  })

  // Get paginated rows manually (the row pagination feature is not registered)
  const paginatedRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    const end = start + pagination.pageSize
    return table.getRowModel().rows.slice(start, end)
  }, [table, pagination])

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pagination.pageSize))

  // Handle opening full data view
  const handleOpenFullView = (tabId: number) => {
    // Track full data view open
    trackEvent(ANALYTICS_EVENTS.FULL_DATA_VIEW_OPEN_BUTTON_PRESS, {
      [ANALYTICS_PROPERTIES.TOTAL_ROWS]: filteredData.length,
      [ANALYTICS_PROPERTIES.COLUMNS_COUNT]: config.columns.length,
    })

    // Use type assertion since WXT will generate this entrypoint
    const fullViewUrl = browser.runtime.getURL(`/full-data-view.html?tabId=${tabId}`)
    reportRejection(browser.tabs.create({ url: fullViewUrl }))

    // Close the sidepanel window after opening the full view
    window.close()
  }

  return (
    <div className="data-table-container relative group">
      {/* Toggle for showing/hiding empty rows */}
      <div className="flex items-center justify-between [&>*:only-child]:ml-auto mb-4">
        {data.filter((r) => r.metadata.isEmpty).length > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <Switch
                id={showEmptyRowsId}
                checked={showEmptyRows}
                onCheckedChange={onShowEmptyRowsChange}
              />
              <label htmlFor={showEmptyRowsId} className="text-sm font-medium">
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
                  {flexRender(header.column.columnDef.header, header.getContext())}
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
                className={row.original.metadata.isEmpty ? 'opacity-60 bg-muted/30' : ''}
              >
                {row.getAllCells().map((cell) => (
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
                  [ANALYTICS_PROPERTIES.DIRECTION]: PAGINATION_DIRECTIONS.PREV,
                  [ANALYTICS_PROPERTIES.FROM_PAGE]: pagination.pageIndex + 1,
                  [ANALYTICS_PROPERTIES.TO_PAGE]: pagination.pageIndex,
                  [ANALYTICS_PROPERTIES.TOTAL_PAGES]: totalPages,
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
                  [ANALYTICS_PROPERTIES.DIRECTION]: PAGINATION_DIRECTIONS.NEXT,
                  [ANALYTICS_PROPERTIES.FROM_PAGE]: pagination.pageIndex + 1,
                  [ANALYTICS_PROPERTIES.TO_PAGE]: pagination.pageIndex + 2,
                  [ANALYTICS_PROPERTIES.TOTAL_PAGES]: totalPages,
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
        {/* Reserve space for pagination when at page size boundary to prevent button overlap */}
        {filteredData.length === pagination.pageSize && <div className="h-8" aria-hidden="true" />}
      </div>

      {/* Floating expand button with anchor positioning */}
      {tabId && (
        <Tooltip key={`floating-button-${anchorKey}`}>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenFullView(tabId)}
              className="
                right-4
                fixed z-50
                anchored/data-table
                anchored-bottom-end
                try-[--avoid-footer,--fallback-bottom]
                anchored-visible-no-overflow
                opacity-0 group-hover:opacity-100
                hover:!bg-secondary hover:scale-105 hover:shadow-md
                transition-all duration-200
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
