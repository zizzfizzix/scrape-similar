import { rowsToXlsxBuffer, XLSX_MIME_TYPE } from '@/utils/export-data'
import type { ScrapedRow } from '@/utils/types'
import type ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

// Helper to create mock scraped rows
const makeRow = (data: Record<string, any>, isEmpty = false): ScrapedRow => ({
  data,
  metadata: { originalIndex: 0, isEmpty },
})

// Helper to safely extract row values from ExcelJS sheet values
// getSheetValues() returns (undefined | (undefined | CellValue)[])[] with 1-based indexing
const getRowValues = (
  sheetValues: ReturnType<ExcelJS.Worksheet['getSheetValues']>,
  rowIndex: number,
): ExcelJS.CellValue[] => {
  const row = sheetValues[rowIndex]
  if (!Array.isArray(row)) {
    throw new Error(`Row ${rowIndex} is not an array`)
  }
  // Slice off the first element (undefined) to get actual cell values
  return row.slice(1)
}

// Helper to grab the worksheet a read-back workbook is expected to contain
const getFirstWorksheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet => {
  const [worksheet] = workbook.worksheets
  if (!worksheet) {
    throw new Error('Workbook has no worksheets')
  }
  return worksheet
}

/** Write the rows through the real export path, then read the file back. */
const roundTrip = async (rows: ScrapedRow[], columnKeys: string[], columns: string[]) => {
  const buffer = await rowsToXlsxBuffer(rows, columnKeys, columns)
  const ExcelJSModule = await import('exceljs')
  const workbook = new ExcelJSModule.default.Workbook()
  await workbook.xlsx.load(buffer)
  return { buffer, workbook, worksheet: getFirstWorksheet(workbook) }
}

describe('Excel export functionality', () => {
  it('generates valid xlsx workbook with correct structure', async () => {
    const columns = ['Column 1', 'Column 2', 'Column 3']
    const rows = [
      makeRow({ col1: 'A1', col2: 'B1', col3: 'C1' }),
      makeRow({ col1: 'A2', col2: 'B2', col3: 'C2' }),
    ]

    const { buffer, workbook, worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], columns)

    expect(buffer.byteLength).toBeGreaterThan(0)
    expect(workbook.worksheets.length).toBe(1)
    expect(worksheet.name).toBe('Data')

    const values = worksheet.getSheetValues()
    expect(getRowValues(values, 1)).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect(getRowValues(values, 2)).toEqual(['A1', 'B1', 'C1'])
    expect(getRowValues(values, 3)).toEqual(['A2', 'B2', 'C2'])
  })

  it('handles null and undefined values correctly', async () => {
    const rows = [makeRow({ col1: 'A1', col2: null, col3: undefined })]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], ['A', 'B', 'C'])

    // Null and undefined are written as empty strings, not left blank.
    expect(worksheet.getRow(2).getCell(1).value).toBe('A1')
    expect(worksheet.getRow(2).getCell(2).value).toBe('')
    expect(worksheet.getRow(2).getCell(3).value).toBe('')
  })

  it('handles empty data rows correctly', async () => {
    const rows = [makeRow({ col1: '', col2: '', col3: '' }, true)]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], ['A', 'B', 'C'])

    expect(worksheet.getRow(2).getCell(1).value).toBe('')
  })

  it('writes the header row even when there are no data rows', async () => {
    const { worksheet } = await roundTrip([], ['col1'], ['Only column'])

    expect(getRowValues(worksheet.getSheetValues(), 1)).toEqual(['Only column'])
    expect(worksheet.rowCount).toBe(1)
  })

  it('preserves column order from columnKeys', async () => {
    const rows = [makeRow({ first: '1', second: '2', third: '3' })]

    const { worksheet } = await roundTrip(
      rows,
      ['third', 'first', 'second'],
      ['Third', 'First', 'Second'],
    )

    const values = worksheet.getSheetValues()
    expect(getRowValues(values, 1)).toEqual(['Third', 'First', 'Second'])
    expect(getRowValues(values, 2)).toEqual(['3', '1', '2'])
  })

  it('handles special characters in cell values', async () => {
    const rows = [
      makeRow({
        col1: 'Value with "quotes"',
        col2: 'Value,with,commas',
        col3: 'Value\twith\ttabs',
      }),
    ]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], ['A', 'B', 'C'])

    expect(getRowValues(worksheet.getSheetValues(), 2)).toEqual([
      'Value with "quotes"',
      'Value,with,commas',
      'Value\twith\ttabs',
    ])
  })

  it('handles numeric and boolean values', async () => {
    const rows = [makeRow({ col1: 42, col2: true, col3: 3.14 })]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], ['A', 'B', 'C'])

    expect(getRowValues(worksheet.getSheetValues(), 2)).toEqual([42, true, 3.14])
  })

  it('handles missing keys in row data', async () => {
    const rows = [makeRow({ col1: 'A1' })]

    const { worksheet } = await roundTrip(rows, ['col1', 'missing'], ['A', 'B'])

    expect(worksheet.getRow(2).getCell(1).value).toBe('A1')
    expect(worksheet.getRow(2).getCell(2).value).toBe('')
  })

  it('handles multiple rows with varying data', async () => {
    const rows = [
      makeRow({ col1: 'A1', col2: 'B1' }),
      makeRow({ col1: 'A2' }),
      makeRow({ col2: 'B3' }),
      makeRow({}, true),
    ]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2'], ['A', 'B'])

    expect(worksheet.rowCount).toBe(5)
    expect(worksheet.getRow(2).getCell(1).value).toBe('A1')
    expect(worksheet.getRow(3).getCell(2).value).toBe('')
    expect(worksheet.getRow(4).getCell(2).value).toBe('B3')
  })

  it('handles unicode and emoji characters', async () => {
    const rows = [makeRow({ col1: '日本語', col2: '🎉 party', col3: 'Ñoño' })]

    const { worksheet } = await roundTrip(rows, ['col1', 'col2', 'col3'], ['A', 'B', 'C'])

    expect(getRowValues(worksheet.getSheetValues(), 2)).toEqual(['日本語', '🎉 party', 'Ñoño'])
  })

  it('handles large datasets efficiently', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      makeRow({ col1: `Row ${i}`, col2: String(i) }),
    )

    const { worksheet } = await roundTrip(rows, ['col1', 'col2'], ['A', 'B'])

    expect(worksheet.rowCount).toBe(1001)
    expect(worksheet.getRow(1001).getCell(1).value).toBe('Row 999')
  })

  it('generates valid blob for download', async () => {
    const buffer = await rowsToXlsxBuffer([makeRow({ col1: 'A1' })], ['col1'], ['A'])

    const blob = new Blob([buffer], { type: XLSX_MIME_TYPE })

    expect(blob.type).toBe(XLSX_MIME_TYPE)
    expect(blob.size).toBeGreaterThan(0)
  })
})
