import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { getColumnKeys } from '@/utils/getColumnKeys'
import { rowsToTsv } from '@/utils/tsv'
import type { ScrapeConfig, ScrapeResult, ScrapedRow } from '@/utils/types'
import { MESSAGE_TYPES } from '@/utils/types'
import log from 'loglevel'
import { ChevronsUpDown, Clipboard, FileDown, Sheet } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface ExportButtonsProps {
  scrapeResult: ScrapeResult
  config: ScrapeConfig
  showEmptyRows: boolean
  selectedRows?: ScrapedRow[]
  filename?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  className?: string
}

const ExportButtons: React.FC<ExportButtonsProps> = ({
  scrapeResult,
  config,
  showEmptyRows,
  selectedRows,
  filename,
  size = 'sm',
  variant = 'outline',
  className = '',
}) => {
  const [isExporting, setIsExporting] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Generate filename if not provided
  const exportFilename = filename || `Data Export - ${new Date().toISOString().split('T')[0]}`

  // Prepare data for export
  const hasSelection = selectedRows && selectedRows.length > 0
  const isExportingAll = !hasSelection || selectedRows.length === (scrapeResult.data || []).length

  const dataToExport =
    hasSelection && !isExportingAll
      ? selectedRows
      : showEmptyRows
        ? scrapeResult.data || []
        : (scrapeResult.data || []).filter((row) => !row.metadata.isEmpty)

  const columns = scrapeResult.columnOrder || []
  const columnKeys = getColumnKeys(columns, config.columns)

  // Generate descriptive text for export actions
  const exportText =
    hasSelection && !isExportingAll
      ? selectedRows!.length === 1
        ? `${selectedRows!.length} row`
        : `${selectedRows!.length} rows`
      : 'all'

  const handleGoogleSheetsExport = () => {
    if (!dataToExport.length) {
      toast.error('No data to export')
      return
    }

    log.debug('🔥 ExportButtons: Starting Google Sheets export')
    setIsExporting(true)

    const messagePayload = {
      type: MESSAGE_TYPES.EXPORT_TO_SHEETS,
      payload: {
        filename: exportFilename,
        scrapedData: dataToExport,
        columnOrder: scrapeResult.columnOrder,
        columnKeys: columnKeys,
      },
    }

    log.debug('🔥 ExportButtons: Sending message:', messagePayload)

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set a timeout to reset the button state if no response comes back
    timeoutRef.current = setTimeout(() => {
      log.warn('🔥 ExportButtons: Export timeout - resetting button state')
      setIsExporting(false)
      setIsDropdownOpen(false)
      toast.error('Export timed out - please try again')
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
        error: 'Export timeout',
      })
      timeoutRef.current = null
    }, 60000) // 60 second timeout

    browser.runtime.sendMessage(messagePayload, (response) => {
      // Clear the timeout since we got a response
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      log.debug('🔥 ExportButtons: Received response:', response)

      // Always reset the exporting state
      setIsExporting(false)
      setIsDropdownOpen(false)

      if (browser.runtime.lastError) {
        log.error('🔥 ExportButtons: Runtime error:', browser.runtime.lastError)
        toast.error(`Connection error: ${browser.runtime.lastError.message}`)
        trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
          error: browser.runtime.lastError.message,
        })
        return
      }

      if (response?.success && response.url) {
        log.debug('🔥 ExportButtons: Export successful')
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
        trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_TRIGGER, {
          rows_exported: dataToExport.length,
          columns_count: columns.length,
        })
      } else {
        log.error('🔥 ExportButtons: Export failed - Full response:', response)
        log.error('🔥 ExportButtons: Response keys:', response ? Object.keys(response) : 'null')
        log.error('🔥 ExportButtons: Response JSON:', JSON.stringify(response, null, 2))

        const errorMessage =
          response?.error ||
          response?.message ||
          `Export failed - Response: ${JSON.stringify(response)}`

        // Special handling for auth cancellation
        if (
          errorMessage.includes('cancelled') ||
          errorMessage.includes('denied') ||
          errorMessage.includes('Authorization')
        ) {
          toast.error('Google authorization was cancelled')
        } else {
          toast.error(`Export failed: ${errorMessage}`)
        }

        trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
          error: errorMessage,
        })
      }
    })
  }

  const handleCopyTsv = async () => {
    if (!dataToExport.length) {
      toast.error('No data to copy')
      return
    }

    const tsvContent = rowsToTsv(dataToExport, columnKeys, columns)

    try {
      await navigator.clipboard.writeText(tsvContent)
      toast.success('Copied to clipboard')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
        rows_copied: dataToExport.length,
        columns_count: columns.length,
        export_type: 'data_table_full',
      })
    } catch {
      toast.error('Failed to copy')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    }
  }

  const handleCsvExport = () => {
    if (!dataToExport.length) {
      toast.error('No data to export')
      return
    }

    const csvContent = [
      columns.map((header) => `"${header.replace(/"/g, '""')}"`).join(','),
      ...dataToExport.map((row) =>
        columnKeys
          .map((key) => {
            const value = row.data[key] || ''
            const escapedValue = value.replace(/"/g, '""')
            return `"${escapedValue}"`
          })
          .join(','),
      ),
    ].join('\n')

    const csvFilename = `${exportFilename}.csv`
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', csvFilename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('CSV file saved')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_TRIGGER, {
        rows_exported: dataToExport.length,
        columns_count: columns.length,
      })
    } catch (e) {
      toast.error('Failed to save CSV')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_FAILURE, {
        error: (e as Error).message,
      })
    }
  }

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          Export
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            if (!isExporting) handleGoogleSheetsExport()
          }}
          disabled={isExporting}
        >
          <Sheet className="h-4 w-4" />
          {isExporting ? 'Exporting…' : `Export ${exportText} to Google Sheets`}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCopyTsv}>
          <Clipboard className="h-4 w-4" />
          Copy {exportText} to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCsvExport}>
          <FileDown className="h-4 w-4" />
          Save {exportText} as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ExportButtons
