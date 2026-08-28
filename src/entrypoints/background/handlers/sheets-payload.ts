/**
 * Pure payload builders for the Google Sheets export.
 *
 * Kept separate from `sheets-export.ts` so the shape of everything sent to the
 * Sheets API can be reasoned about (and tested) without any network or OAuth.
 */

/** Light grey, as the Sheets API wants colour channels as 0-1 floats. */
const HEADER_BACKGROUND = { red: 0.95, green: 0.95, blue: 0.95 }

export interface SheetValues {
  headers: string[]
  /** Header row followed by one array of cell strings per scraped row. */
  values: string[][]
}

/**
 * Resolve the header row and cell matrix for a scrape result.
 *
 * `columnOrder` holds the display names; `columnKeys` holds the internal keys
 * the row data is actually keyed by (they differ when column names repeat).
 * Either may be absent, in which case the keys of the first row stand in.
 */
export const buildSheetValues = (
  scrapedData: ScrapedData,
  columnOrder?: string[],
  columnKeys?: string[],
): SheetValues => {
  const [firstRow] = scrapedData ?? []
  if (!firstRow) return { headers: [], values: [] }

  const headers = columnOrder && columnOrder.length > 0 ? columnOrder : Object.keys(firstRow.data)
  if (headers.length === 0) return { headers: [], values: [] }

  const dataKeys = columnKeys && columnKeys.length > 0 ? columnKeys : headers

  return {
    headers,
    values: [headers, ...scrapedData.map((row) => dataKeys.map((key) => row.data[key] || ''))],
  }
}

export const buildCreateSpreadsheetBody = (filename: string) => ({
  properties: { title: filename },
})

export const buildAppendValuesBody = (values: string[][]) => ({
  range: 'A1',
  majorDimension: 'ROWS' as const,
  values,
})

/** Request body that bolds/shades the header row and auto-sizes the columns. */
export const buildHeaderFormatBody = (sheetId: number, columnCount: number) => ({
  requests: [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_BACKGROUND,
            textFormat: { bold: true },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS' as const,
          startIndex: 0,
          endIndex: columnCount,
        },
      },
    },
  ],
})

export const SHEETS_API = {
  create: () => 'https://sheets.googleapis.com/v4/spreadsheets',
  appendValues: (spreadsheetId: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
  batchUpdate: (spreadsheetId: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
} as const
