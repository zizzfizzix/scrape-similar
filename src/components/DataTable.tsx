import { Button } from '@/components/ui/button'
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
import { ScrapeConfig, ScrapedData } from '@/core/types'
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Highlighter } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onRowHighlight: (selector: string) => void
  columnOrder?: string[]
}

const DataTable: React.FC<DataTableProps> = ({ data, config, onRowHighlight, columnOrder }) => {
  // Use columnOrder if provided, otherwise fallback to config.columns order
  const columnsOrder =
    columnOrder && columnOrder.length > 0 ? columnOrder : config.columns.map((col) => col.name)

  // Pagination state
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  // Reset pagination when data changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [data])

  // Build columns for TanStack Table
  const columns = useMemo<ColumnDef<Record<string, string>>[]>(() => {
    const baseColumns: ColumnDef<Record<string, string>>[] = [
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }) => row.index + 1 + pagination.pageIndex * pagination.pageSize,
        size: 40,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const rowIndex = row.index + pagination.pageIndex * pagination.pageSize
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Highlight this element"
                  onClick={() => {
                    const rowSelector = `(${config.mainSelector})[${rowIndex + 1}]`
                    onRowHighlight(rowSelector)
                  }}
                >
                  <Highlighter className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Highlight this element</TooltipContent>
            </Tooltip>
          )
        },
        size: 60,
      },
      ...columnsOrder.map((colName) => ({
        accessorKey: colName,
        header: colName,
        cell: (cell: { getValue: () => unknown }) => {
          const value = cell.getValue() as string
          return value && value.length > 100 ? `${value.substring(0, 100)}...` : value
        },
      })),
    ]
    return baseColumns
  }, [columnsOrder, config.mainSelector, onRowHighlight, pagination.pageIndex, pagination.pageSize])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: false,
    manualSorting: false,
    manualFiltering: false,
    state: { pagination },
    onPaginationChange: setPagination,
    pageCount: Math.ceil(data.length / pagination.pageSize),
    getPaginationRowModel: undefined, // use built-in client-side pagination
  })

  // Get paginated rows manually (since getPaginationRowModel is undefined)
  const paginatedRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize
    const end = start + pagination.pageSize
    return table.getRowModel().rows.slice(start, end)
  }, [table, pagination])

  const totalPages = Math.max(1, Math.ceil(data.length / pagination.pageSize))

  return (
    <div className="data-table-container">
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
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
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
