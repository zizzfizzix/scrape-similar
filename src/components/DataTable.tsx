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
import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'
import { ScrapeConfig, ScrapedData, ScrapedRow } from '@/core/types'
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Highlighter } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onRowHighlight: (selector: string) => void
  columnOrder?: string[]
  showEmptyRows: boolean
  onShowEmptyRowsChange?: (show: boolean) => void
}

const DataTable: React.FC<DataTableProps> = ({
  data,
  config,
  onRowHighlight,
  columnOrder,
  showEmptyRows = false,
  onShowEmptyRowsChange,
}) => {
  // Use columnOrder if provided, otherwise fallback to config.columns order
  const columnsOrder =
    columnOrder && columnOrder.length > 0 ? columnOrder : config.columns.map((col) => col.name)

  // Pagination state
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  // Filter data based on showEmptyRows toggle
  const filteredData = useMemo(() => {
    return showEmptyRows ? data : data.filter((row) => !row.metadata.isEmpty)
  }, [data, showEmptyRows])

  // Reset pagination when data changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [filteredData])

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
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
          // Use the original index for highlighting
          const originalIndex = row.original.metadata.originalIndex
          const isEmpty = row.original.metadata.isEmpty

          const button = (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
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

          // Only wrap with tooltip if row is not empty
          if (isEmpty) {
            return button
          }

          return (
            <Tooltip>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>Highlight this element</TooltipContent>
            </Tooltip>
          )
        },
        size: 60,
      },
      ...columnsOrder.map(
        (colName): ColumnDef<ScrapedRow> => ({
          accessorKey: colName,
          header: colName,
          cell: ({ row }: CellContext<ScrapedRow, unknown>) => {
            const value = row.original.data[colName] || ''
            return value && value.length > 100 ? `${value.substring(0, 100)}...` : value
          },
        }),
      ),
    ]
    return baseColumns
  }, [columnsOrder, config.mainSelector, onRowHighlight, filteredData])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: false,
    manualSorting: false,
    manualFiltering: false,
    state: { pagination },
    onPaginationChange: setPagination,
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

  return (
    <div className="data-table-container">
      {/* Toggle for showing/hiding empty rows */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Switch
            id="show-empty-rows"
            checked={showEmptyRows}
            onCheckedChange={onShowEmptyRowsChange}
          />
          <label htmlFor="show-empty-rows" className="text-sm font-medium">
            Show empty rows
          </label>
        </div>
        <div className="text-sm text-muted-foreground">
          {showEmptyRows
            ? `${filteredData.length} total rows (${data.filter((r) => r.metadata.isEmpty).length} empty)`
            : `${filteredData.length} rows with data`}
        </div>
      </div>

      <div className="table-wrapper">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize?.() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {/* Pagination Controls */}
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            trackEvent(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESSED, {
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
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            trackEvent(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESSED, {
              direction: 'next',
              from_page: pagination.pageIndex + 1,
              to_page: pagination.pageIndex + 2,
              total_pages: totalPages,
            })
            setPagination((p) => ({ ...p, pageIndex: Math.min(totalPages - 1, p.pageIndex + 1) }))
          }}
          disabled={pagination.pageIndex >= totalPages - 1}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export default DataTable
