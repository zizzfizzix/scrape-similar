import {
  buildAppendValuesBody,
  buildCreateSpreadsheetBody,
  buildHeaderFormatBody,
  buildSheetValues,
  SHEETS_API,
} from '@/entrypoints/background/handlers/sheets-payload'
import type { ScrapedData } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const row = (data: Record<string, string>, originalIndex = 0): ScrapedData[number] => ({
  data,
  metadata: { originalIndex, isEmpty: false },
})

describe('buildSheetValues', () => {
  it('returns nothing for an empty result set', () => {
    expect(buildSheetValues([])).toEqual({ headers: [], values: [] })
  })

  it('returns nothing when the result set is missing entirely', () => {
    expect(buildSheetValues(undefined as unknown as ScrapedData)).toEqual({
      headers: [],
      values: [],
    })
  })

  it('returns nothing when the first row has no columns', () => {
    expect(buildSheetValues([row({})])).toEqual({ headers: [], values: [] })
  })

  it('derives headers from the first row when no order is given', () => {
    const result = buildSheetValues([row({ Title: 'A', URL: 'https://a' })])

    expect(result.headers).toEqual(['Title', 'URL'])
    expect(result.values).toEqual([
      ['Title', 'URL'],
      ['A', 'https://a'],
    ])
  })

  it('honours an explicit column order', () => {
    const result = buildSheetValues([row({ Title: 'A', URL: 'https://a' })], ['URL', 'Title'])

    expect(result.values).toEqual([
      ['URL', 'Title'],
      ['https://a', 'A'],
    ])
  })

  it('falls back to the first row when the given order is empty', () => {
    const result = buildSheetValues([row({ Title: 'A' })], [])

    expect(result.headers).toEqual(['Title'])
  })

  it('reads cells by internal key while writing display names as headers', () => {
    const result = buildSheetValues(
      [row({ col_0: 'first', col_1: 'second' })],
      ['Name', 'Name'],
      ['col_0', 'col_1'],
    )

    expect(result.values).toEqual([
      ['Name', 'Name'],
      ['first', 'second'],
    ])
  })

  it('falls back to headers as keys when the key list is empty', () => {
    const result = buildSheetValues([row({ Title: 'A' })], ['Title'], [])

    expect(result.values[1]).toEqual(['A'])
  })

  it('writes an empty string for cells missing from a row', () => {
    const result = buildSheetValues(
      [row({ Title: 'A', URL: 'https://a' }), row({ Title: 'B' }, 1)],
      ['Title', 'URL'],
    )

    expect(result.values).toEqual([
      ['Title', 'URL'],
      ['A', 'https://a'],
      ['B', ''],
    ])
  })
})

describe('buildCreateSpreadsheetBody', () => {
  it('titles the new spreadsheet', () => {
    expect(buildCreateSpreadsheetBody('My scrape')).toEqual({
      properties: { title: 'My scrape' },
    })
  })
})

describe('buildAppendValuesBody', () => {
  it('appends rows starting at A1', () => {
    const values = [['Title'], ['A']]

    expect(buildAppendValuesBody(values)).toEqual({
      range: 'A1',
      majorDimension: 'ROWS',
      values,
    })
  })
})

describe('buildHeaderFormatBody', () => {
  it('bolds the header row and auto-sizes every column', () => {
    const body = buildHeaderFormatBody(7, 3)

    expect(body.requests[0]?.repeatCell?.range).toEqual({
      sheetId: 7,
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 3,
    })
    expect(body.requests[0]?.repeatCell?.cell.userEnteredFormat.textFormat).toEqual({ bold: true })
    expect(body.requests[1]?.autoResizeDimensions?.dimensions).toEqual({
      sheetId: 7,
      dimension: 'COLUMNS',
      startIndex: 0,
      endIndex: 3,
    })
  })
})

describe('SHEETS_API', () => {
  it('builds the v4 endpoints', () => {
    expect(SHEETS_API.create()).toBe('https://sheets.googleapis.com/v4/spreadsheets')
    expect(SHEETS_API.appendValues('abc')).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/abc/values/A1:append?valueInputOption=USER_ENTERED',
    )
    expect(SHEETS_API.batchUpdate('abc')).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/abc:batchUpdate',
    )
  })
})
