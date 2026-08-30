import {
  exportToGoogleSheets,
  handleExportToSheets,
  validateExportPayload,
} from '@/entrypoints/background/handlers/sheets-export'
import type { MessageResponse, ScrapedData } from '@/utils/types'
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  requestAuthToken: vi.fn(),
  removeCachedAuthToken: vi.fn(),
}))
vi.mock('@/entrypoints/background/utils/auth', () => authMocks)

const row = (data: Record<string, string>, originalIndex = 0): ScrapedData[number] => ({
  data,
  metadata: { originalIndex, isEmpty: false },
})

const scrapedData: ScrapedData = [row({ Title: 'A', URL: 'https://a' })]

/** Queue one JSON response per fetch call, in order. */
const stubFetch = (
  responses: Array<{ ok?: boolean; status?: number; statusText?: string; body?: unknown }>,
) => {
  const fetchMock = vi.fn()
  for (const { ok: isOk = true, status = 200, statusText = 'OK', body = {} } of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: isOk,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
    })
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const createdSpreadsheet = {
  spreadsheetId: 'sheet-1',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1',
  sheets: [{ properties: { sheetId: 42 } }],
}

describe('validateExportPayload', () => {
  it('accepts a complete payload', () => {
    const result = validateExportPayload({
      filename: 'Export',
      scrapedData,
      columnOrder: ['Title'],
      columnKeys: ['col_0'],
    })

    expect(result).toEqual({
      isValid: true,
      data: { filename: 'Export', scrapedData, columnOrder: ['Title'], columnKeys: ['col_0'] },
    })
  })

  it('rejects a missing payload', () => {
    expect(validateExportPayload(undefined)).toEqual({
      isValid: false,
      error: 'Filename is required for export',
    })
  })

  it('rejects a blank filename', () => {
    expect(validateExportPayload({ filename: '   ', scrapedData })).toEqual({
      isValid: false,
      error: 'Filename is required for export',
    })
  })

  it('rejects a missing data set', () => {
    expect(validateExportPayload({ filename: 'Export' })).toEqual({
      isValid: false,
      error: 'No data to export',
    })
  })

  it('rejects an empty data set', () => {
    expect(validateExportPayload({ filename: 'Export', scrapedData: [] })).toEqual({
      isValid: false,
      error: 'No data to export',
    })
  })

  it('rejects a data set that is not an array', () => {
    expect(validateExportPayload({ filename: 'Export', scrapedData: 'nope' })).toEqual({
      isValid: false,
      error: 'No data to export',
    })
  })
})

describe('exportToGoogleSheets', () => {
  beforeEach(() => {
    authMocks.removeCachedAuthToken.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates the sheet, appends the rows and formats the header', async () => {
    const fetchMock = stubFetch([{ body: createdSpreadsheet }, {}, {}])

    const result = await exportToGoogleSheets('tok', scrapedData, 'Export', ['Title', 'URL'])

    expect(result).toEqual({ success: true, url: createdSpreadsheet.spreadsheetUrl })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [createUrl, createInit] = fetchMock.mock.calls[0]!
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets')
    expect(createInit.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(createInit.body)).toEqual({ properties: { title: 'Export' } })

    const [appendUrl, appendInit] = fetchMock.mock.calls[1]!
    expect(appendUrl).toContain('/sheet-1/values/A1:append')
    expect(JSON.parse(appendInit.body).values).toEqual([
      ['Title', 'URL'],
      ['A', 'https://a'],
    ])

    const [formatUrl, formatInit] = fetchMock.mock.calls[2]!
    expect(formatUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets/sheet-1:batchUpdate')
    expect(JSON.parse(formatInit.body).requests[0].repeatCell.range.sheetId).toBe(42)
  })

  it('refuses an empty data set without calling the API', async () => {
    const fetchMock = stubFetch([])

    await expect(exportToGoogleSheets('tok', [], 'Export')).resolves.toEqual({
      success: false,
      error: 'No data to export',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses rows with no columns', async () => {
    const fetchMock = stubFetch([])

    await expect(exportToGoogleSheets('tok', [row({})], 'Export')).resolves.toEqual({
      success: false,
      error: 'No columns found in data',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the cached token and asks the user to retry on a 401', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    stubFetch([{ ok: false, status: 401, statusText: 'Unauthorized' }])

    await expect(exportToGoogleSheets('tok', scrapedData, 'Export')).resolves.toEqual({
      success: false,
      error: 'Authentication expired. Please try again.',
    })
    expect(authMocks.removeCachedAuthToken).toHaveBeenCalledWith('tok')
  })

  it('surfaces the API error body on a non-401 failure', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    stubFetch([
      {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        body: { error: { message: 'Insufficient scope' } },
      },
    ])

    const result = await exportToGoogleSheets('tok', scrapedData, 'Export')

    expect(result.success).toBe(false)
    expect(result.error).toContain('API request failed: Forbidden')
    expect(result.error).toContain('Insufficient scope')
  })

  it('tolerates an error response with an unreadable body', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValue(new Error('not json')),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await exportToGoogleSheets('tok', scrapedData, 'Export')

    expect(result.error).toBe('API request failed: Internal Server Error {}')
  })

  it('reports a network failure', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    await expect(exportToGoogleSheets('tok', scrapedData, 'Export')).resolves.toEqual({
      success: false,
      error: 'Failed to fetch',
    })
  })
})

describe('handleExportToSheets', () => {
  let sendResponse: ReturnType<typeof vi.fn<(response?: MessageResponse) => void>>

  beforeEach(() => {
    sendResponse = vi.fn()
    authMocks.removeCachedAuthToken.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('responds with the new spreadsheet URL on success', async () => {
    authMocks.requestAuthToken.mockResolvedValue({ success: true, token: 'tok' })
    stubFetch([{ body: createdSpreadsheet }, {}, {}])

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse, '🟡')

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      url: createdSpreadsheet.spreadsheetUrl,
    })
  })

  it('responds with the validation error without requesting a token', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})

    await handleExportToSheets({ scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Filename is required for export',
    })
    expect(authMocks.requestAuthToken).not.toHaveBeenCalled()
  })

  it('responds with the auth error when the user declines', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockResolvedValue({
      success: false,
      error: 'Google authorization was cancelled',
    })

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Google authorization was cancelled',
    })
  })

  it('falls back to a generic message when auth fails without one', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockResolvedValue({ success: false })

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed',
    })
  })

  it('treats a successful auth result with no token as a failure', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockResolvedValue({ success: true })

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed',
    })
  })

  it('responds with the export error when the API rejects the request', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockResolvedValue({ success: true, token: 'tok' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Failed to fetch' })
  })

  it('falls back to a generic message when the export fails without one', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockResolvedValue({ success: true, token: 'tok' })
    // An error with no message leaves exportToGoogleSheets with nothing to report.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('')))

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Export failed' })
  })

  it('responds with the error when requesting the token itself throws', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    authMocks.requestAuthToken.mockRejectedValue(new Error('identity unavailable'))

    await handleExportToSheets({ filename: 'Export', scrapedData }, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'identity unavailable',
    })
  })
})
