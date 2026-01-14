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

describe('Excel export functionality', () => {
  it('generates valid xlsx workbook with correct structure', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Column 1', 'Column 2', 'Column 3']
    const rows = [
      makeRow({ col1: 'A1', col2: 'B1', col3: 'C1' }),
      makeRow({ col1: 'A2', col2: 'B2', col3: 'C2' }),
    ]
    const columnKeys = ['col1', 'col2', 'col3']

    // Add header row
    worksheet.addRow(columns)

    // Add data rows
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Verify buffer is valid
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.byteLength).toBeGreaterThan(0)

    // Read back and verify
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    expect(readWorkbook.worksheets.length).toBe(1)
    expect(readWorkbook.worksheets[0].name).toBe('Data')

    const readSheet = readWorkbook.worksheets[0]
    const values = readSheet.getSheetValues()

    // getSheetValues returns array with 1-based indexing, and each row has undefined at index 0
    expect(getRowValues(values, 1)).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect(getRowValues(values, 2)).toEqual(['A1', 'B1', 'C1'])
    expect(getRowValues(values, 3)).toEqual(['A2', 'B2', 'C2'])
  })

  it('handles null and undefined values correctly', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Col1', 'Col2', 'Col3']
    const rows = [makeRow({ col1: null, col2: undefined, col3: 'value' })]
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    // Null and undefined should become empty strings
    expect(getRowValues(values, 2)).toEqual(['', '', 'value'])
  })

  it('handles empty data rows correctly', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Col1', 'Col2']
    const rows = [makeRow({ col1: '', col2: '' })]
    const columnKeys = ['col1', 'col2']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    expect(getRowValues(values, 2)).toEqual(['', ''])
  })

  it('preserves column order from columnKeys', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Third', 'First', 'Second']
    const rows = [makeRow({ col1: 'A', col2: 'B', col3: 'C' })]
    const columnKeys = ['col3', 'col1', 'col2'] // Different order

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    // Should follow columnKeys order: col3, col1, col2 -> C, A, B
    expect(getRowValues(values, 2)).toEqual(['C', 'A', 'B'])
  })

  it('handles special characters in cell values', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Col1', 'Col2', 'Col3']
    const rows = [
      makeRow({
        col1: 'Line\nBreak',
        col2: 'Tab\there',
        col3: 'Quote"Test',
      }),
    ]
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    // Excel should preserve special characters
    expect(getRowValues(values, 2)).toEqual(['Line\nBreak', 'Tab\there', 'Quote"Test'])
  })

  it('handles numeric and boolean values', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Number', 'Boolean', 'String']
    const rows = [makeRow({ col1: 123, col2: true, col3: 'text' })]
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    expect(getRowValues(values, 2)).toEqual([123, true, 'text'])
  })

  it('handles missing keys in row data', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Col1', 'Col2', 'Col3']
    const rows = [makeRow({ col1: 'A', col3: 'C' })] // col2 is missing
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    expect(getRowValues(values, 2)).toEqual(['A', '', 'C'])
  })

  it('handles multiple rows with varying data', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Name', 'Age', 'City']
    const rows = [
      makeRow({ col1: 'Alice', col2: 30, col3: 'NYC' }),
      makeRow({ col1: 'Bob', col2: null, col3: 'LA' }),
      makeRow({ col1: 'Charlie', col2: 25, col3: '' }),
    ]
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    expect(getRowValues(values, 1)).toEqual(['Name', 'Age', 'City'])
    expect(getRowValues(values, 2)).toEqual(['Alice', 30, 'NYC'])
    expect(getRowValues(values, 3)).toEqual(['Bob', '', 'LA'])
    expect(getRowValues(values, 4)).toEqual(['Charlie', 25, ''])
  })

  it('handles unicode and emoji characters', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Emoji', 'Unicode', 'Mixed']
    const rows = [makeRow({ col1: '😃👍', col2: '中文', col3: 'Test 🚀' })]
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    expect(getRowValues(values, 2)).toEqual(['😃👍', '中文', 'Test 🚀'])
  })

  it('handles large datasets efficiently', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    const columns = ['Col1', 'Col2', 'Col3']
    const rows: ScrapedRow[] = []
    for (let i = 0; i < 1000; i++) {
      rows.push(makeRow({ col1: `A${i}`, col2: `B${i}`, col3: `C${i}` }))
    }
    const columnKeys = ['col1', 'col2', 'col3']

    worksheet.addRow(columns)
    for (const row of rows) {
      worksheet.addRow(columnKeys.map((key) => row.data[key] ?? ''))
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const readWorkbook = new ExcelJS.default.Workbook()
    await readWorkbook.xlsx.load(buffer)

    const values = readWorkbook.worksheets[0].getSheetValues()
    // Should have header + 1000 data rows
    expect(values.length).toBe(1002) // 1-based index + header + 1000 rows
  })

  it('generates valid blob for download', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    const worksheet = workbook.addWorksheet('Data')

    worksheet.addRow(['Col1', 'Col2'])
    worksheet.addRow(['A', 'B'])

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })
})
