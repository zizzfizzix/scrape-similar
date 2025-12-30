import type { ExportResult } from '@/entrypoints/background/types'
import { removeCachedAuthToken, requestAuthToken } from '@/entrypoints/background/utils/auth'
import log from 'loglevel'

/**
 * Validate EXPORT_TO_SHEETS payload structure
 */
export const validateExportPayload = (
  payload: any,
): {
  isValid: boolean
  error?: string
  data?: {
    filename: string
    scrapedData: ScrapedData
    columnOrder?: string[]
    columnKeys?: string[]
  }
} => {
  const { filename, scrapedData, columnOrder, columnKeys } = payload || {}

  if (!filename || !filename.trim()) {
    return { isValid: false, error: 'Filename is required for export' }
  }
  if (!scrapedData || !Array.isArray(scrapedData) || scrapedData.length === 0) {
    return { isValid: false, error: 'No data to export' }
  }

  return { isValid: true, data: { filename, scrapedData, columnOrder, columnKeys } }
}

/**
 * Handle EXPORT_TO_SHEETS message from any context
 */
export const handleExportToSheets = async (
  payload: any,
  sendResponse: (response?: MessageResponse) => void,
  logPrefix: string = '',
): Promise<void> => {
  log.debug(`${logPrefix} Processing EXPORT_TO_SHEETS`)

  const validation = validateExportPayload(payload)
  if (!validation.isValid) {
    log.error(`${logPrefix} Validation failed:`, validation.error)
    sendResponse({ success: false, error: validation.error || 'Validation failed' })
    return
  }

  const { filename, scrapedData, columnOrder, columnKeys } = validation.data!

  log.debug(`${logPrefix} Validation passed, requesting auth token`)

  try {
    const authResult = await requestAuthToken()
    if (!authResult.success || !authResult.token) {
      log.error(`${logPrefix} Auth token error:`, authResult.error)
      sendResponse({ success: false, error: authResult.error || 'Authentication failed' })
      return
    }

    log.debug(`${logPrefix} Token received, calling exportToGoogleSheets`)
    const exportResult = await exportToGoogleSheets(
      authResult.token,
      scrapedData,
      filename,
      columnOrder,
      columnKeys,
    )

    log.debug(`${logPrefix} Export result:`, exportResult)

    if (exportResult.success) {
      sendResponse({ success: true, url: exportResult.url })
    } else {
      sendResponse({ success: false, error: exportResult.error || 'Export failed' })
    }
  } catch (error) {
    log.error(`${logPrefix} Export error:`, error)
    sendResponse({ success: false, error: (error as Error).message })
  }
}

/**
 * Export scraped data to a new Google Sheet
 * Creates spreadsheet, populates data, and formats header row
 */
export const exportToGoogleSheets = async (
  token: string,
  scrapedData: ScrapedData,
  filename: string,
  columnOrder?: string[],
  columnKeys?: string[],
): Promise<ExportResult> => {
  try {
    if (!scrapedData || !scrapedData.length) {
      return { success: false, error: 'No data to export' }
    }

    // Get column headers - use columnOrder if available, otherwise fallback to Object.keys
    const headers =
      columnOrder && columnOrder.length > 0 ? columnOrder : Object.keys(scrapedData[0].data)

    if (headers.length === 0) {
      return { success: false, error: 'No columns found in data' }
    }

    // Use columnKeys for data access if available, otherwise use headers
    const dataKeys = columnKeys && columnKeys.length > 0 ? columnKeys : headers

    // Create sheet values (header row + data rows)
    const values = [
      headers,
      ...scrapedData.map((row) => dataKeys.map((key) => row.data[key] || '')),
    ]

    // Helper function to make authenticated requests
    const makeRequest = async (url: string, options: RequestInit) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 401) {
        await removeCachedAuthToken(token)
        throw new Error('Authentication token expired')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`API request failed: ${response.statusText} ${JSON.stringify(errorData)}`)
      }

      return response.json()
    }

    // Create a new spreadsheet
    const spreadsheet = await makeRequest('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: filename,
        },
      }),
    })

    const spreadsheetId = spreadsheet.spreadsheetId
    const spreadsheetUrl = spreadsheet.spreadsheetUrl

    // Get the sheet ID from the created spreadsheet
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Update values in the sheet first
    await makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        body: JSON.stringify({
          range: 'A1',
          majorDimension: 'ROWS',
          values,
        }),
      },
    )

    // Then format the header row and auto-resize using the correct sheet ID
    await makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                    textFormat: { bold: true },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        }),
      },
    )

    log.debug(`Successfully exported data to Google Sheet: ${spreadsheetUrl}`)
    return {
      success: true,
      url: spreadsheetUrl,
    }
  } catch (error) {
    log.error('Error exporting to Google Sheets:', error)

    if ((error as Error).message.includes('Authentication token expired')) {
      return {
        success: false,
        error: 'Authentication expired. Please try again.',
      }
    }

    return {
      success: false,
      error: (error as Error).message,
    }
  }
}
