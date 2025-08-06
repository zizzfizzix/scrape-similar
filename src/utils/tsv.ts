import { ScrapedRow } from '@/utils/types'

/**
 * Escape characters that would break TSV formatting.
 * @param value Raw cell value
 * @returns Escaped value safe for TSV
 */
const escapeTsvField = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')

/**
 * Convert a single row to a TSV line given an ordered list of column keys.
 */
export const rowToTsv = (row: ScrapedRow, columnKeys: string[]): string =>
  columnKeys
    .map((key) => {
      const value = row.data[key] ?? ''
      return escapeTsvField(String(value))
    })
    .join('\t')

/**
 * Convert multiple rows to TSV string. Optionally include header row.
 */
export const rowsToTsv = (rows: ScrapedRow[], columnKeys: string[], header?: string[]): string => {
  const headerLine = header ? header.map(escapeTsvField).join('\t') : undefined
  const dataLines = rows.map((row) => rowToTsv(row, columnKeys))
  return headerLine ? [headerLine, ...dataLines].join('\n') : dataLines.join('\n')
}
