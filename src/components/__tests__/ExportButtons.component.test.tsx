// @vitest-environment jsdom
import ExportButtons from '@/components/ExportButtons'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { SHEETS_EXPORT_TIMEOUT_MS } from '@/utils/export-data'
import { MESSAGE_TYPES, type ScrapeConfig, type ScrapedRow, type ScrapeResult } from '@/utils/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import {
  findByRole,
  openRadixTrigger,
  querySelector,
  renderComponent,
  type RenderResult,
} from '@@/tests/support/react'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => toastMocks)

const exportMocks = vi.hoisted(() => ({ downloadFile: vi.fn(), rowsToXlsxBuffer: vi.fn() }))
vi.mock('@/utils/export-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/export-data')>()),
  downloadFile: exportMocks.downloadFile,
  rowsToXlsxBuffer: exportMocks.rowsToXlsxBuffer,
}))

let view: RenderResult | undefined

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const filled = row({ Title: 'Hello', URL: 'https://a' })
const blank = row({ Title: '', URL: '' }, true, 1)

const scrapeResult: ScrapeResult = { data: [filled, blank], columnOrder: ['Title', 'URL'] }
const config: ScrapeConfig = {
  mainSelector: '//a',
  columns: [
    { name: 'Title', selector: '.' },
    { name: 'URL', selector: '@href' },
  ],
}

const render = (props: Partial<Parameters<typeof ExportButtons>[0]> = {}) =>
  renderComponent(
    <ExportButtons
      scrapeResult={scrapeResult}
      config={config}
      showEmptyRows={false}
      {...(props as Parameters<typeof ExportButtons>[0])}
    />,
  )

const trigger = () => querySelector<HTMLButtonElement>(view!.container, 'button')
const openMenu = () => view!.act(() => openRadixTrigger(trigger()))
const menuItem = (label: string) => findByRole('menuitem', label)

const choose = async (label: string) => {
  await openMenu()
  await view!.act(async () => {
    menuItem(label).click()
    await Promise.resolve()
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  setLastError(undefined)
  exportMocks.rowsToXlsxBuffer.mockResolvedValue(new ArrayBuffer(8))
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ExportButtons', () => {
  it('offers all four export destinations', async () => {
    view = await render()

    await openMenu()

    expect(menuItem('Copy all to clipboard')).toBeTruthy()
    expect(menuItem('Save all as CSV')).toBeTruthy()
    expect(menuItem('Export all to Google Sheets')).toBeTruthy()
    expect(menuItem('Save all to Excel (.xlsx)')).toBeTruthy()
  })

  it('says "all" when nothing is ticked', async () => {
    view = await render()

    await openMenu()

    expect(menuItem('Save all as CSV')).toBeTruthy()
  })

  it('counts a single ticked row', async () => {
    view = await render({ selectedRows: [filled] })

    await openMenu()

    expect(menuItem('Save 1 row as CSV')).toBeTruthy()
  })

  it('counts several ticked rows', async () => {
    view = await render({
      selectedRows: [filled, blank],
      scrapeResult: {
        data: [filled, blank, row({ Title: 'third' }, false, 2)],
        columnOrder: ['Title', 'URL'],
      },
    })

    await openMenu()

    expect(menuItem('Save 2 rows as CSV')).toBeTruthy()
  })

  describe('copying to the clipboard', () => {
    it('writes the visible rows as TSV', async () => {
      view = await render()

      await choose('Copy all to clipboard')

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Title\tURL\nHello\thttps://a')
      expect(toastMocks.toast.success).toHaveBeenCalledWith('Copied to clipboard')
    })

    it('includes the empty rows when they are shown', async () => {
      view = await render({ showEmptyRows: true })

      await choose('Copy all to clipboard')

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Title\tURL\nHello\thttps://a\n\t')
    })

    it('records the attempt before it can fail', async () => {
      view = await render()

      await choose('Copy all to clipboard')

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
        rows_copied: 1,
        columns_count: 2,
        export_type: 'data_table_full',
      })
    })

    it('reports a clipboard the browser refused', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
      view = await render()

      await choose('Copy all to clipboard')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to copy')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    })

    it('refuses when there is nothing to copy', async () => {
      view = await render({ scrapeResult: { data: [blank], columnOrder: ['Title'] } })

      await choose('Copy all to clipboard')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('No data to copy')
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    })
  })

  describe('saving a CSV', () => {
    it('downloads the visible rows', async () => {
      view = await render()

      await choose('Save all as CSV')

      expect(exportMocks.downloadFile).toHaveBeenCalledWith(
        '"Title","URL"\n"Hello","https://a"',
        expect.stringMatching(/\.csv$/),
        'text/csv;charset=utf-8;',
      )
      expect(toastMocks.toast.success).toHaveBeenCalledWith('CSV file saved')
    })

    it('uses the filename it was given', async () => {
      view = await render({ filename: 'My export' })

      await choose('Save all as CSV')

      expect(exportMocks.downloadFile).toHaveBeenCalledWith(
        expect.anything(),
        'My export.csv',
        expect.anything(),
      )
    })

    it('dates the filename when none was given', async () => {
      view = await render()

      await choose('Save all as CSV')

      expect(exportMocks.downloadFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^Data Export - \d{4}-\d{2}-\d{2}\.csv$/),
        expect.anything(),
      )
    })

    it('reports a download the browser refused', async () => {
      exportMocks.downloadFile.mockImplementationOnce(() => {
        throw new Error('no blob support')
      })
      view = await render()

      await choose('Save all as CSV')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to save CSV')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXPORT_TO_CSV_FAILURE, {
        error: 'no blob support',
      })
    })

    it('refuses when there is nothing to export', async () => {
      view = await render({ scrapeResult: { data: [], columnOrder: [] } })

      await choose('Save all as CSV')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('No data to export')
    })
  })

  describe('saving an Excel file', () => {
    it('downloads the workbook', async () => {
      view = await render()

      await choose('Save all to Excel (.xlsx)')

      expect(exportMocks.rowsToXlsxBuffer).toHaveBeenCalledWith(
        [filled],
        ['Title', 'URL'],
        ['Title', 'URL'],
      )
      expect(exportMocks.downloadFile).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        expect.stringMatching(/\.xlsx$/),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      expect(toastMocks.toast.success).toHaveBeenCalledWith('Excel file saved')
    })

    it('reports a workbook it could not build', async () => {
      exportMocks.rowsToXlsxBuffer.mockRejectedValueOnce(new Error('out of memory'))
      view = await render()

      await choose('Save all to Excel (.xlsx)')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to save to Excel')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXPORT_TO_XLSX_FAILURE, {
        error: 'out of memory',
      })
    })

    it('refuses when there is nothing to export', async () => {
      view = await render({ scrapeResult: { data: [], columnOrder: [] } })

      await choose('Save all to Excel (.xlsx)')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('No data to export')
      expect(exportMocks.rowsToXlsxBuffer).not.toHaveBeenCalled()
    })
  })

  describe('exporting to Google Sheets', () => {
    /** Reply to the background's export request with `response`. */
    const backgroundReplies = (response: unknown, lastError?: { message?: string }) =>
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
        (_message: unknown, callback?: (r: unknown) => void) => {
          setLastError(lastError)
          callback?.(response)
          setLastError(undefined)
          return Promise.resolve(response)
        },
      )

    it('asks the background to build the spreadsheet', async () => {
      const sendMessage = backgroundReplies({ success: true, url: 'https://docs.google.com/x' })
      view = await render({ filename: 'My export' })

      await choose('Export all to Google Sheets')

      expect(sendMessage).toHaveBeenCalledWith(
        {
          type: MESSAGE_TYPES.EXPORT_TO_SHEETS,
          payload: {
            filename: 'My export',
            scrapedData: [filled],
            columnOrder: ['Title', 'URL'],
            columnKeys: ['Title', 'URL'],
          },
        },
        expect.any(Function),
      )
      expect(toastMocks.toast.success).toHaveBeenCalledWith(
        'Exported to Google Sheets',
        expect.anything(),
      )
    })

    it('records the attempt before it can fail', async () => {
      backgroundReplies({ success: true, url: 'https://docs.google.com/x' })
      view = await render()

      await choose('Export all to Google Sheets')

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_TRIGGER, {
        rows_exported: 1,
        columns_count: 2,
      })
    })

    it('reports a connection failure', async () => {
      backgroundReplies(undefined, { message: 'port closed' })
      view = await render()

      await choose('Export all to Google Sheets')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Connection error: port closed')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
        error: 'port closed',
      })
    })

    it('reports a refusal from the background', async () => {
      backgroundReplies({ success: false, error: 'Quota exceeded' })
      view = await render()

      await choose('Export all to Google Sheets')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Export failed: Quota exceeded')
    })

    it('reports a cancelled authorization plainly', async () => {
      backgroundReplies({ success: false, error: 'Google authorization was cancelled' })
      view = await render()

      await choose('Export all to Google Sheets')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Google authorization was cancelled')
    })

    it('treats a success with no URL as a failure', async () => {
      backgroundReplies({ success: true })
      view = await render()

      await choose('Export all to Google Sheets')

      expect(toastMocks.toast.success).not.toHaveBeenCalled()
      expect(toastMocks.toast.error).toHaveBeenCalled()
    })

    it('gives up when the background never replies', async () => {
      vi.useFakeTimers()
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
        () => new Promise(() => {}),
      )
      view = await render()

      await choose('Export all to Google Sheets')
      await view.act(() => {
        vi.advanceTimersByTime(SHEETS_EXPORT_TIMEOUT_MS)
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Export timed out - please try again')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXPORT_TO_SHEETS_FAILURE, {
        error: 'Export timeout',
      })
      vi.useRealTimers()
    })

    it('refuses when there is nothing to export', async () => {
      const sendMessage = backgroundReplies({ success: true })
      view = await render({ scrapeResult: { data: [], columnOrder: [] } })

      await choose('Export all to Google Sheets')

      expect(toastMocks.toast.error).toHaveBeenCalledWith('No data to export')
      expect(sendMessage).not.toHaveBeenCalled()
    })
  })

  it('passes size, variant and class through to the trigger', async () => {
    view = await render({ size: 'lg', variant: 'secondary', className: 'export-trigger' })

    expect(trigger().className).toContain('export-trigger')
  })
})
