// @vitest-environment jsdom
import {
  CSV_MIME_TYPE,
  defaultExportFilename,
  describeExportScope,
  describeSheetsExportFailure,
  downloadFile,
  resolveExportRows,
  rowsToCsv,
  SHEETS_EXPORT_TIMEOUT_MS,
} from '@/utils/export-data'
import type { ScrapeResult, ScrapedRow } from '@/utils/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const result = (data: ScrapedRow[], columnOrder = ['Title']): ScrapeResult => ({
  data,
  columnOrder,
})

describe('resolveExportRows', () => {
  const filled = row({ Title: 'a' })
  const blank = row({ Title: '' }, true, 1)

  it('exports every row when empty rows are shown', () => {
    const resolved = resolveExportRows({
      scrapeResult: result([filled, blank]),
      showEmptyRows: true,
    })

    expect(resolved.rows).toEqual([filled, blank])
    expect(resolved.hasSelection).toBe(false)
    expect(resolved.isExportingAll).toBe(true)
  })

  it('drops empty rows when they are hidden', () => {
    const resolved = resolveExportRows({
      scrapeResult: result([filled, blank]),
      showEmptyRows: false,
    })

    expect(resolved.rows).toEqual([filled])
  })

  it('exports only the ticked rows', () => {
    const resolved = resolveExportRows({
      scrapeResult: result([filled, blank]),
      selectedRows: [blank],
      showEmptyRows: false,
    })

    expect(resolved.rows).toEqual([blank])
    expect(resolved.hasSelection).toBe(true)
    expect(resolved.isExportingAll).toBe(false)
  })

  it('treats ticking every row as exporting everything', () => {
    const resolved = resolveExportRows({
      scrapeResult: result([filled, blank]),
      selectedRows: [filled, blank],
      showEmptyRows: true,
    })

    expect(resolved.isExportingAll).toBe(true)
    expect(resolved.rows).toEqual([filled, blank])
  })

  it('ignores an empty selection', () => {
    const resolved = resolveExportRows({
      scrapeResult: result([filled]),
      selectedRows: [],
      showEmptyRows: true,
    })

    expect(resolved.hasSelection).toBe(false)
    expect(resolved.rows).toEqual([filled])
  })

  it('copes with a result that has no rows at all', () => {
    const resolved = resolveExportRows({
      scrapeResult: { columnOrder: [] } as unknown as ScrapeResult,
      showEmptyRows: true,
    })

    expect(resolved.rows).toEqual([])
    expect(resolved.isExportingAll).toBe(true)
  })
})

describe('describeExportScope', () => {
  const rows = [row({ Title: 'a' }), row({ Title: 'b' }, false, 1)]

  it('says "all" when nothing is ticked', () => {
    expect(describeExportScope({ rows, hasSelection: false, isExportingAll: true })).toBe('all')
  })

  it('says "all" when every row is ticked', () => {
    expect(describeExportScope({ rows, hasSelection: true, isExportingAll: true })).toBe('all')
  })

  it('counts a single ticked row in the singular', () => {
    expect(
      describeExportScope({ rows: [rows[0]!], hasSelection: true, isExportingAll: false }),
    ).toBe('1 row')
  })

  it('counts several ticked rows in the plural', () => {
    expect(describeExportScope({ rows, hasSelection: true, isExportingAll: false })).toBe('2 rows')
  })
})

describe('defaultExportFilename', () => {
  it('dates the filename', () => {
    expect(defaultExportFilename(new Date('2026-08-27T13:45:00Z'))).toBe('Data Export - 2026-08-27')
  })

  it('uses the UTC date, not the local one', () => {
    expect(defaultExportFilename(new Date('2026-08-27T23:30:00Z'))).toBe('Data Export - 2026-08-27')
  })
})

describe('rowsToCsv', () => {
  it('writes a header row followed by the data', () => {
    const csv = rowsToCsv(
      [row({ Title: 'Hello', URL: 'https://a' })],
      ['Title', 'URL'],
      ['Title', 'URL'],
    )

    expect(csv).toBe('"Title","URL"\n"Hello","https://a"')
  })

  it('writes only the header when there are no rows', () => {
    expect(rowsToCsv([], ['Title'], ['Title'])).toBe('"Title"')
  })

  it('doubles embedded quotes in values', () => {
    expect(rowsToCsv([row({ Title: 'He said "hi"' })], ['Title'], ['Title'])).toBe(
      '"Title"\n"He said ""hi"""',
    )
  })

  it('doubles embedded quotes in headers', () => {
    expect(rowsToCsv([], ['Title'], ['The "best" column'])).toBe('"The ""best"" column"')
  })

  it('quotes values containing commas and newlines', () => {
    expect(rowsToCsv([row({ Title: 'a,b\nc' })], ['Title'], ['Title'])).toBe('"Title"\n"a,b\nc"')
  })

  it('writes an empty field for a missing key', () => {
    expect(rowsToCsv([row({ Title: 'a' })], ['Title', 'Missing'], ['Title', 'Missing'])).toBe(
      '"Title","Missing"\n"a",""',
    )
  })

  it('reads values by internal key while writing display names as headers', () => {
    const csv = rowsToCsv(
      [row({ col_0: 'first', col_1: 'second' })],
      ['col_0', 'col_1'],
      ['Name', 'Name'],
    )

    expect(csv).toBe('"Name","Name"\n"first","second"')
  })
})

describe('downloadFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let click: ReturnType<typeof vi.fn<(this: HTMLAnchorElement) => void>>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:generated-url')
    revokeObjectURL = vi.fn()
    click = vi.fn<(this: HTMLAnchorElement) => void>()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('clicks a link pointing at the generated blob', () => {
    downloadFile('a,b', 'export.csv', CSV_MIME_TYPE)

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('names the download', () => {
    let downloadName: string | undefined
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download
    })

    downloadFile('a,b', 'export.csv', CSV_MIME_TYPE)

    expect(downloadName).toBe('export.csv')
  })

  it('uses the given MIME type for the blob', async () => {
    downloadFile('a,b', 'export.csv', CSV_MIME_TYPE)

    const [blob] = createObjectURL.mock.calls[0] as [Blob]
    expect(blob.type).toBe(CSV_MIME_TYPE)
    await expect(blob.text()).resolves.toBe('a,b')
  })

  it('detaches the link and releases the blob afterwards', () => {
    downloadFile('a,b', 'export.csv', CSV_MIME_TYPE)

    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:generated-url')
  })
})

describe('describeSheetsExportFailure', () => {
  it('reports the error the background gave', () => {
    expect(describeSheetsExportFailure({ error: 'Quota exceeded' })).toEqual({
      error: 'Quota exceeded',
      toast: 'Export failed: Quota exceeded',
    })
  })

  it('falls back to a message field', () => {
    expect(describeSheetsExportFailure({ message: 'Bad request' }).error).toBe('Bad request')
  })

  it('includes the whole reply when it names no reason', () => {
    const failure = describeSheetsExportFailure({ success: false })

    expect(failure.error).toBe('Export failed - Response: {"success":false}')
  })

  it('handles a missing reply', () => {
    expect(describeSheetsExportFailure(undefined).error).toBe('Export failed - Response: undefined')
  })

  it('handles a null reply', () => {
    expect(describeSheetsExportFailure(null).error).toBe('Export failed - Response: null')
  })

  it('reports a cancelled authorization plainly', () => {
    expect(describeSheetsExportFailure({ error: 'The flow was cancelled' }).toast).toBe(
      'Google authorization was cancelled',
    )
  })

  it('reports a denied authorization plainly', () => {
    expect(describeSheetsExportFailure({ error: 'Access denied' }).toast).toBe(
      'Google authorization was cancelled',
    )
  })

  it('reports a failed Authorization step plainly', () => {
    expect(describeSheetsExportFailure({ error: 'Authorization failed' }).toast).toBe(
      'Google authorization was cancelled',
    )
  })
})

describe('SHEETS_EXPORT_TIMEOUT_MS', () => {
  it('gives the background a full minute to reply', () => {
    expect(SHEETS_EXPORT_TIMEOUT_MS).toBe(60_000)
  })
})
