import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useShownToast } from '@/hooks/use-shown-toast'
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
import { reportRejection } from '@/utils/report-rejection'
import { rowsToTsv } from '@/utils/tsv'
import type { ScrapeConfig, ScrapedRow, ScrapeResult } from '@/utils/types'
import { MESSAGE_TYPES } from '@/utils/types'
import log from 'loglevel'
import { ChevronsUpDown, Clipboard, FileDown, FileSpreadsheet, Sheet } from 'lucide-react'
import React, { useEffect, useState } from 'react'

interface ExportButtonsProps {
  scrapeResult: ScrapeResult
  config: ScrapeConfig
  showEmptyRows: boolean
  selectedRows?: ScrapedRow[]
  /** Called at export time, so repeated exports get their own timestamp. */
  buildFilename?: (now: Date) => string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  className?: string
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  scrapeResult,
  config,
  showEmptyRows,
  selectedRows,
  buildFilename = defaultExportFilename,
  size = 'sm',
  variant = 'outline',
  className = '',
}) => {
  const [isExporting, setIsExporting] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const notify = useShownToast()

  // Reset the button if the background never replies (e.g. the service worker
  // was torn down mid-export). An effect rather than a timer started on click,
  // so a side panel tab hidden mid-export arms it again when shown.
  useEffect(() => {
    if (!isExporting) return
    const timer = setTimeout(() => {
      log.warn('🔥 ExportButtons: Export timeout - resetting button state')
      setIsExporting(false)
      setIsDropdownOpen(false)
      notify.error('Export timed out - please try again')
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
        error: 'Export timeout',
      })
    }, SHEETS_EXPORT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isExporting, notify])

  const resolved = resolveExportRows({ scrapeResult, selectedRows, showEmptyRows })
  const dataToExport = resolved.rows
  const exportText = describeExportScope(resolved)

  const columns = scrapeResult.columnOrder || []
  const columnKeys = getColumnKeys(columns, config.columns)

  const handleGoogleSheetsExport = () => {
    if (!dataToExport.length) {
      notify.error('No data to export')
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
        filename: buildFilename(new Date()),
        scrapedData: dataToExport,
        columnOrder: scrapeResult.columnOrder,
        columnKeys: columnKeys,
      },
    }

    log.debug('🔥 ExportButtons: Sending message:', messagePayload)

    browser.runtime.sendMessage(messagePayload, (response) => {
      log.debug('🔥 ExportButtons: Received response:', response)

      // Always reset the exporting state
      setIsExporting(false)
      setIsDropdownOpen(false)

      if (browser.runtime.lastError) {
        log.error('🔥 ExportButtons: Runtime error:', browser.runtime.lastError)
        notify.error(`Connection error: ${browser.runtime.lastError.message}`)
        trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
          error: browser.runtime.lastError.message,
        })
        return
      }

      if (response?.success && response.url) {
        log.debug('🔥 ExportButtons: Export successful')
        notify.success('Exported to Google Sheets', {
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
      notify.error(failure.toast)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, { error: failure.error })
    })
  }

  const handleCopyTsv = async () => {
    if (!dataToExport.length) {
      notify.error('No data to copy')
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
      notify.success('Copied to clipboard')
      setIsDropdownOpen(false)
    } catch {
      notify.error('Failed to copy')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    }
  }

  const handleCsvExport = () => {
    if (!dataToExport.length) {
      notify.error('No data to export')
      return
    }

    // Track trigger before attempting work so it's recorded even on failure
    trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_TRIGGER, {
      rows_exported: dataToExport.length,
      columns_count: columns.length,
    })

    try {
      const csv = rowsToCsv(dataToExport, columnKeys, columns)
      downloadFile(csv, `${buildFilename(new Date())}.csv`, CSV_MIME_TYPE)
      notify.success('CSV file saved')
      setIsDropdownOpen(false)
    } catch (e) {
      notify.error('Failed to save CSV')
      setIsDropdownOpen(false)
      trackEvent(ANALYTICS_EVENTS.EXPORT_TO_CSV_FAILURE, {
        error: (e as Error).message,
      })
    }
  }

  const handleXlsxExport = async () => {
    if (!dataToExport.length) {
      notify.error('No data to export')
      return
    }

    // Track trigger before attempting work so it's recorded even on failure
    trackEvent(ANALYTICS_EVENTS.EXPORT_TO_XLSX_TRIGGER, {
      rows_exported: dataToExport.length,
      columns_count: columns.length,
    })

    try {
      const buffer = await rowsToXlsxBuffer(dataToExport, columnKeys, columns)
      downloadFile(buffer, `${buildFilename(new Date())}.xlsx`, XLSX_MIME_TYPE)
      notify.success('Excel file saved')
      setIsDropdownOpen(false)
    } catch (e) {
      notify.error('Failed to save to Excel')
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
        <DropdownMenuItem onSelect={() => reportRejection(handleCopyTsv())}>
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
        <DropdownMenuItem onSelect={() => reportRejection(handleXlsxExport())}>
          <FileSpreadsheet className="h-4 w-4" />
          Save {exportText} to Excel (.xlsx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
