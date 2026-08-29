// @vitest-environment jsdom
import DataTable from '@/components/DataTable'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import type { ScrapeConfig, ScrapedData, ScrapedRow } from '@/utils/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { type RenderResult, act, render as renderComponent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => toastMocks)

let view: RenderResult

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [
    { name: 'Rank', selector: './td[1]' },
    { name: 'Country', selector: './td[2]' },
  ],
}

const data: ScrapedData = [
  row({ Rank: '1', Country: 'Poland' }),
  row({ Rank: '2', Country: 'Spain' }, false, 1),
  row({ Rank: '', Country: '' }, true, 2),
]

type DataTableProps = Parameters<typeof DataTable>[0]

const render = (overrides: Partial<DataTableProps> = {}) => {
  const props: DataTableProps = {
    data,
    config,
    onRowHighlight: () => {},
    showEmptyRows: false,
    ...overrides,
  }
  return renderComponent(
    <TooltipProvider>
      <DataTable {...props} />
    </TooltipProvider>,
  )
}

const bodyRows = () => [...view.container.querySelectorAll('tbody tr')]
const headers = () => [...view.container.querySelectorAll('th')].map((th) => th.textContent)
const button = (label: string) =>
  view.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const allButtons = (label: string) => [
  ...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
]

/** Rows of `count` filled records, for exercising pagination. */
const manyRows = (count: number): ScrapedData =>
  Array.from({ length: count }, (_, i) => row({ Rank: String(i + 1), Country: `C${i}` }, false, i))

beforeEach(() => {
  fakeBrowser.reset()
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
})

describe('DataTable', () => {
  it('renders a header per configured column, plus the index and actions', async () => {
    view = render()

    expect(headers()).toEqual(['#', 'Actions', 'Rank', 'Country'])
  })

  it('honours an explicit column order', async () => {
    view = render({ columnOrder: ['Country', 'Rank'] })

    expect(headers()).toEqual(['#', 'Actions', 'Country', 'Rank'])
  })

  it('falls back to the config order for an empty column order', async () => {
    view = render({ columnOrder: [] })

    expect(headers()).toEqual(['#', 'Actions', 'Rank', 'Country'])
  })

  it('hides the empty rows by default', async () => {
    view = render()

    expect(bodyRows()).toHaveLength(2)
    expect(view.container.textContent).toContain('2 rows with data')
  })

  it('shows the empty rows when asked', async () => {
    view = render({ showEmptyRows: true })

    expect(bodyRows()).toHaveLength(3)
    expect(view.container.textContent).toContain('3 total rows')
  })

  it('offers a toggle counting the empty rows', async () => {
    view = render()

    expect(view.container.textContent).toContain('Show 1 empty rows')
  })

  it('reports the toggle being flipped', async () => {
    const onShowEmptyRowsChange = vi.fn()
    view = render({ onShowEmptyRowsChange })

    await act(() => view.container.querySelector<HTMLElement>('[role="switch"]')!.click())

    expect(onShowEmptyRowsChange).toHaveBeenCalledWith(true)
  })

  it('omits the toggle when no row is empty', async () => {
    view = render({ data: [row({ Rank: '1', Country: 'Poland' })] })

    expect(view.container.querySelector('[role="switch"]')).toBeNull()
    expect(view.container.textContent).toContain('1 rows with data')
  })

  it('numbers the visible rows from one', async () => {
    view = render()

    expect(bodyRows()[0]?.querySelector('td')?.textContent).toBe('1')
    expect(bodyRows()[1]?.querySelector('td')?.textContent).toBe('2')
  })

  it('shows the scraped values', async () => {
    view = render()

    expect(bodyRows()[0]?.textContent).toContain('Poland')
    expect(bodyRows()[1]?.textContent).toContain('Spain')
  })

  it('redacts the scraped values from analytics but not the row controls', async () => {
    view = render()

    const cells = [...bodyRows()[0]!.querySelectorAll('td')]
    expect(cells[0]?.className).not.toContain('ph_hidden')
    expect(cells[1]?.className).not.toContain('ph_hidden')
    expect(cells[2]?.className).toContain('ph_hidden')
  })

  it('says so when every row is filtered out', async () => {
    view = render({ data: [row({ Rank: '', Country: '' }, true)] })

    expect(view.container.textContent).toContain('No data')
  })

  it('truncates a very long value in the cell', async () => {
    const long = 'x'.repeat(150)
    view = render({ data: [row({ Rank: '1', Country: long })] })

    const cell = [...view.container.querySelectorAll('tbody td')].find((td) =>
      td.textContent?.startsWith('xxx'),
    )!
    expect(cell.textContent).toBe(`${'x'.repeat(100)}...`)
    // The full value stays available as the cell's tooltip.
    expect(cell.querySelector('[title]')?.getAttribute('title')).toBe(long)
  })

  it('highlights the resize handle while a column is being dragged', async () => {
    view = render()
    const handle = view.container.querySelector<HTMLElement>('.cursor-col-resize')!

    expect(handle.className).toContain('opacity-0')

    await act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }))
    })

    expect(view.container.querySelector<HTMLElement>('.cursor-col-resize')!.className).toContain(
      'bg-primary opacity-100',
    )
  })

  describe('highlighting a row', () => {
    it('asks for the row at its original position', async () => {
      const onRowHighlight = vi.fn()
      view = render({ onRowHighlight })

      await userEvent.click(allButtons('Highlight this element')[1]!)

      expect(onRowHighlight).toHaveBeenCalledWith('(//tr)[2]')
    })

    it('counts from the original data, not the filtered view', async () => {
      const onRowHighlight = vi.fn()
      view = render({
        onRowHighlight,
        data: [row({ Rank: '', Country: '' }, true), row({ Rank: '1' }, false, 1)],
      })

      await userEvent.click(button('Highlight this element'))

      expect(onRowHighlight).toHaveBeenCalledWith('(//tr)[2]')
    })

    it('cannot highlight an empty row', async () => {
      view = render({ showEmptyRows: true })

      const buttons = [...bodyRows()[2]!.querySelectorAll('button')]
      expect(buttons[0]?.disabled).toBe(true)
      expect(buttons[0]?.getAttribute('aria-label')).toBeNull()
    })
  })

  describe('copying a row', () => {
    it('copies the row as TSV', async () => {
      view = render()

      await act(async () => {
        allButtons('Copy this row')[0]!.click()
        await Promise.resolve()
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1\tPoland')
      expect(toastMocks.toast.success).toHaveBeenCalledWith('Copied row to clipboard')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
        rows_copied: 1,
        columns_count: 2,
        export_type: 'data_table_row',
      })
    })

    it('reports a clipboard the browser refused', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
      view = render()

      await act(async () => {
        allButtons('Copy this row')[0]!.click()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to copy')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    })

    it('cannot copy an empty row', async () => {
      view = render({ showEmptyRows: true })

      const buttons = [...bodyRows()[2]!.querySelectorAll('button')]
      expect(buttons[1]?.disabled).toBe(true)
    })
  })

  describe('pagination', () => {
    it('shows only the first page', async () => {
      view = render({ data: manyRows(25) })

      expect(bodyRows()).toHaveLength(10)
      expect(view.container.textContent).toContain('Page 1 of 3')
    })

    it('moves to the next page', async () => {
      view = render({ data: manyRows(25) })

      await userEvent.click(button('Next page'))

      expect(view.container.textContent).toContain('Page 2 of 3')
      expect(bodyRows()[0]?.textContent).toContain('C10')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESS, {
        direction: 'next',
        from_page: 1,
        to_page: 2,
        total_pages: 3,
      })
    })

    it('moves back to the previous page', async () => {
      view = render({ data: manyRows(25) })
      await userEvent.click(button('Next page'))

      await userEvent.click(button('Previous page'))

      expect(view.container.textContent).toContain('Page 1 of 3')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PAGINATION_BUTTON_PRESS, {
        direction: 'prev',
        from_page: 2,
        to_page: 1,
        total_pages: 3,
      })
    })

    it('cannot go back from the first page', async () => {
      view = render({ data: manyRows(25) })

      expect(button('Previous page').disabled).toBe(true)
    })

    it('cannot go past the last page', async () => {
      view = render({ data: manyRows(25) })

      await userEvent.click(button('Next page'))
      await userEvent.click(button('Next page'))

      expect(button('Next page').disabled).toBe(true)
      expect(bodyRows()).toHaveLength(5)
    })

    it('reserves the control space when the data exactly fills a page', async () => {
      view = render({ data: manyRows(10) })

      expect(view.container.querySelector('button[aria-label="Next page"]')).toBeNull()
      expect(view.container.querySelector('[aria-hidden="true"].h-8')).not.toBeNull()
    })

    it('hides the controls when everything fits on one page', async () => {
      view = render()

      expect(view.container.querySelector('button[aria-label="Next page"]')).toBeNull()
    })

    it('returns to the first page when the data changes', async () => {
      view = render({ data: manyRows(25) })
      await userEvent.click(button('Next page'))

      view.rerender(
        <TooltipProvider>
          <DataTable
            data={manyRows(30)}
            config={config}
            onRowHighlight={() => {}}
            showEmptyRows={false}
          />
        </TooltipProvider>,
      )

      expect(view.container.textContent).toContain('Page 1 of 3')
    })
  })

  describe('the full data view', () => {
    it('is not offered without a tab to open it for', async () => {
      view = render()

      expect(view.container.querySelector('button[aria-label="Open in full view"]')).toBeNull()
    })

    it('opens a tab for the current page and closes the panel', async () => {
      const create = spyOnBrowser(fakeBrowser.tabs, 'create').mockResolvedValue({} as never)
      const close = vi.spyOn(window, 'close').mockImplementation(() => {})
      view = render({ tabId: 7 })

      await userEvent.click(button('Open in full view'))

      expect(create).toHaveBeenCalledWith({
        url: fakeBrowser.runtime.getURL('/full-data-view.html?tabId=7' as never),
      })
      expect(close).toHaveBeenCalled()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_OPEN_BUTTON_PRESS, {
        total_rows: 2,
        columns_count: 2,
      })
    })
  })
})
