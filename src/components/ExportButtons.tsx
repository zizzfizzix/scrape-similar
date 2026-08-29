import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import {
  CSV_MIME_TYPE,
  defaultExportFilename,
  describeExportScope,
  describeSheetsExportFailure,
  downloadFile,
  resolveExportRows,
  rowsToCsv,
  rowsToXlsxBuffer,
  SHEETS_EXPORT_TIMEOUT_MS,
  XLSX_MIME_TYPE,
} from '@/utils/export-data'
import { getColumnKeys } from '@/utils/getColumnKeys'
import { rowsToTsv } from '@/utils/tsv'
import type { ScrapeConfig, ScrapeResult, ScrapedRow } from '@/utils/types'
import { MESSAGE_TYPES } from '@/utils/types'
import log from 'loglevel'
import { ChevronsUpDown, Clipboard, FileDown, FileSpreadsheet, Sheet } from 'lucide-react'
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

  /** Cancel the pending "export never replied" timer, if one is armed. */
  const clearExportTimeout = () => {
    clearTimeout(timeoutRef.current ?? undefined)
    timeoutRef.current = null
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return clearExportTimeout
  }, [])

  const exportFilename = filename || defaultExportFilename(new Date())

  const resolved = resolveExportRows({ scrapeResult, selectedRows, showEmptyRows })
  const dataToExport = resolved.rows
  const exportText = describeExportScope(resolved)

  const columns = scrapeResult.columnOrder || []
  const columnKeys = getColumnKeys(columns, config.columns)

  const handleGoogleSheetsExport = () => {
    if (!dataToExport.length) {
      toast.error('No data to export')
      return
    }

    log.debug('🔥 ExportButtons: Starting Google Sheets export')
    setIsExporting(true)

    // Track the export trigger immediately when user clicks, not dependent on success
    trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_TRIGGER, {
      rows_exported: dataToExport.length,
      columns_count: columns.length,
    })

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
    clearExportTimeout()

    // Reset the button if the background never replies (e.g. the service worker
    // was torn down mid-export).
    timeoutRef.current = setTimeout(() => {
      log.warn('🔥 ExportButtons: Export timeout - resetting button state')
      setIsExporting(false)
      setIsDropdownOpen(false)
      toast.error('Export timed out - please try again')
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
        error: 'Export timeout',
      })
      timeoutRef.current = null
    }, SHEETS_EXPORT_TIMEOUT_MS)

    browser.runtime.sendMessage(messagePayload, (response) => {
      // Clear the timeout since we got a response
      clearExportTimeout()

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
        return
      }

      log.error('🔥 ExportButtons: Export failed - Full response:', response)
      const failure = describeSheetsExportFailure(response)
      toast.error(failure.toast)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, { error: failure.error })
    })
  }

  const handleCopyTsv = async () => {
    if (!dataToExport.length) {
      toast.error('No data to copy')
      return
    }

    // Track trigger before attempting work so it's recorded even on failure
    trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
      rows_copied: dataToExport.length,
      columns_count: columns.length,
      export_type: 'data_table_full',
    })

    try {
      await navigator.clipboard.writeText(rowsToTsv(dataToExport, columnKeys, columns))
      toast.success('Copied to clipboard')
      setIsDropdownOpen(false)
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

    // Track trigger before attempting work so it's recorded even on failure
    trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_TRIGGER, {
      rows_exported: dataToExport.length,
      columns_count: columns.length,
    })

    try {
      const csv = rowsToCsv(dataToExport, columnKeys, columns)
      downloadFile(csv, `${exportFilename}.csv`, CSV_MIME_TYPE)
      toast.success('CSV file saved')
      setIsDropdownOpen(false)
    } catch (e) {
      toast.error('Failed to save CSV')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_FAILURE, {
        error: (e as Error).message,
      })
    }
  }

  const handleXlsxExport = async () => {
    if (!dataToExport.length) {
      toast.error('No data to export')
      return
    }

    // Track trigger before attempting work so it's recorded even on failure
    trackEvent(ANALYTICS_EVENTS.EXPORT_TO_XLSX_TRIGGER, {
      rows_exported: dataToExport.length,
      columns_count: columns.length,
    })

    try {
      const buffer = await rowsToXlsxBuffer(dataToExport, columnKeys, columns)
      downloadFile(buffer, `${exportFilename}.xlsx`, XLSX_MIME_TYPE)
      toast.success('Excel file saved')
      setIsDropdownOpen(false)
    } catch (e) {
      toast.error('Failed to save to Excel')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_XLSX_FAILURE, {
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
        <DropdownMenuItem onSelect={handleCopyTsv}>
          <Clipboard className="h-4 w-4" />
          Copy {exportText} to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleCsvExport}>
          <FileDown className="h-4 w-4" />
          Save {exportText} as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            // Keep the menu open so the in-progress state stays visible; the
            // `disabled` flag below is what stops a second export.
            e.preventDefault()
            handleGoogleSheetsExport()
          }}
          disabled={isExporting}
        >
          <Sheet className="h-4 w-4" />
          {isExporting ? 'Exporting…' : `Export ${exportText} to Google Sheets`}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleXlsxExport}>
          <FileSpreadsheet className="h-4 w-4" />
          Save {exportText} to Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ExportButtons
