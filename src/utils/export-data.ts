/**
 * Serialisation and download plumbing shared by the export menu.
 *
 * Split out of `ExportButtons.tsx` so the exact bytes each format produces can
 * be asserted without rendering the menu.
 */

/** How many seconds to wait for the background's Sheets export before giving up. */
export const SHEETS_EXPORT_TIMEOUT_MS = 60_000

export interface ExportSelection {
  scrapeResult: ScrapeResult
  /** Rows the user ticked, if any. */
  selectedRows?: ScrapedRow[]
  /** Whether rows where every column came back blank should be included. */
  showEmptyRows: boolean
}

export interface ResolvedExport {
  /** The rows that will actually be written. */
  rows: ScrapedRow[]
  /** True when the user ticked at least one row. */
  hasSelection: boolean
  /** True when the export covers the whole result rather than a subset. */
  isExportingAll: boolean
}

/**
 * Decide which rows an export should cover.
 *
 * A partial tick-selection wins outright; otherwise the whole result is
 * exported, minus the empty rows when they are hidden. Ticking every row counts
 * as exporting everything, so the menu keeps saying "all".
 */
export const resolveExportRows = ({
  scrapeResult,
  selectedRows,
  showEmptyRows,
}: ExportSelection): ResolvedExport => {
  const allRows = scrapeResult.data || []
  const hasSelection = !!selectedRows && selectedRows.length > 0
  const isExportingAll = !hasSelection || selectedRows!.length === allRows.length

  const rows =
    hasSelection && !isExportingAll
      ? selectedRows!
      : showEmptyRows
        ? allRows
        : allRows.filter((row) => !row.metadata.isEmpty)

  return { rows, hasSelection, isExportingAll }
}

/** Label for the export menu items: either "all" or the ticked row count. */
export const describeExportScope = ({
  rows,
  hasSelection,
  isExportingAll,
}: ResolvedExport): string => {
  if (!hasSelection || isExportingAll) return 'all'
  return rows.length === 1 ? '1 row' : `${rows.length} rows`
}

/** Default download name, dated so repeated exports do not collide. */
export const defaultExportFilename = (now: Date): string =>
  `Data Export - ${now.toISOString().split('T')[0]}`

/** Quote a CSV field, doubling any embedded quotes. */
const toCsvField = (value: string): string => `"${value.replace(/"/g, '""')}"`

/**
 * Render rows as CSV with a header row.
 *
 * `columns` are the display names for the header; `columnKeys` are the internal
 * keys the row data is stored under, which differ when column names repeat.
 */
export const rowsToCsv = (rows: ScrapedRow[], columnKeys: string[], columns: string[]): string =>
  [
    columns.map(toCsvField).join(','),
    ...rows.map((row) => columnKeys.map((key) => toCsvField(row.data[key] || '')).join(',')),
  ].join('\n')

/**
 * Build an .xlsx workbook with a header row and one row per record.
 *
 * ExcelJS is imported lazily: it is by far the largest dependency, and only
 * this one export path needs it.
 */
export const rowsToXlsxBuffer = async (
  rows: ScrapedRow[],
  columnKeys: string[],
  columns: string[],
): Promise<ArrayBuffer> => {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Data')

  worksheet.addRow(columns)
  for (const row of rows) {
    worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
  }

  return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>
}

/** Hand `content` to the browser as a file download named `filename`. */
export const downloadFile = (content: BlobPart, filename: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const CSV_MIME_TYPE = 'text/csv;charset=utf-8;'
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface SheetsExportFailure {
  /** Message to report to analytics. */
  error: string
  /** Message to show the user. */
  toast: string
}

/**
 * Explain why a Sheets export did not produce a spreadsheet.
 *
 * A cancelled or denied OAuth prompt is the user's own doing, so it gets a
 * plain message rather than an error dump.
 */
export const describeSheetsExportFailure = (response: unknown): SheetsExportFailure => {
  const reply = (response ?? undefined) as { error?: string; message?: string } | undefined
  const error =
    reply?.error || reply?.message || `Export failed - Response: ${JSON.stringify(response)}`

  const wasCancelled =
    error.includes('cancelled') || error.includes('denied') || error.includes('Authorization')

  return {
    error,
    toast: wasCancelled ? 'Google authorization was cancelled' : `Export failed: ${error}`,
  }
}
