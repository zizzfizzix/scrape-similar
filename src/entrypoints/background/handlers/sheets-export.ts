import log from 'loglevel'
import type { ExportResult } from '../types'
import { removeCachedAuthToken, requestAuthToken } from '../utils/auth'
import {
  buildAppendValuesBody,
  buildCreateSpreadsheetBody,
  buildHeaderFormatBody,
  buildSheetValues,
  SHEETS_API,
} from './sheets-payload'

export interface ExportPayload {
  filename: string
  scrapedData: ScrapedData
  columnOrder?: string[]
  columnKeys?: string[]
}

/**
 * Result of validating an EXPORT_TO_SHEETS payload. Modelled as a discriminated
 * union so a valid result always carries `data` and an invalid one always
 * carries `error`.
 */
export type ExportPayloadValidation =
  { isValid: true; data: ExportPayload } | { isValid: false; error: string }

/**
 * Validate EXPORT_TO_SHEETS payload structure
 */
export const validateExportPayload = (payload: any): ExportPayloadValidation => {
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
    sendResponse({ success: false, error: validation.error })
    return
  }

  const { filename, scrapedData, columnOrder, columnKeys } = validation.data

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
 * Issue an authenticated Sheets API request, surfacing an expired token as a
 * distinct error so the caller can ask the user to retry.
 */
const requestSheetsApi = async (token: string, url: string, body: unknown): Promise<any> => {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
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
    const { headers, values } = buildSheetValues(scrapedData, columnOrder, columnKeys)

    if (!scrapedData?.length) {
      return { success: false, error: 'No data to export' }
    }
    if (headers.length === 0) {
      return { success: false, error: 'No columns found in data' }
    }

    const spreadsheet = await requestSheetsApi(
      token,
      SHEETS_API.create(),
      buildCreateSpreadsheetBody(filename),
    )

    const spreadsheetId = spreadsheet.spreadsheetId
    const spreadsheetUrl = spreadsheet.spreadsheetUrl
    const sheetId = spreadsheet.sheets[0].properties.sheetId

    // Write the rows before formatting, so the header row exists to format.
    await requestSheetsApi(
      token,
      SHEETS_API.appendValues(spreadsheetId),
      buildAppendValuesBody(values),
    )

    await requestSheetsApi(
      token,
      SHEETS_API.batchUpdate(spreadsheetId),
      buildHeaderFormatBody(sheetId, headers.length),
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
