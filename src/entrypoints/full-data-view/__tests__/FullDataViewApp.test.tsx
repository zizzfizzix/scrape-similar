// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { FullDataViewApp } from '@/entrypoints/full-data-view/FullDataViewApp'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import {
  MESSAGE_TYPES,
  type ScrapeConfig,
  type ScrapedRow,
  type SidePanelConfig,
} from '@/utils/types'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import { renderSettled } from '@@/tests/support/settle'
import { type RenderResult, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: toastMocks.toast,
}))

let view: RenderResult

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [
    { name: 'Rank', selector: './td[1]' },
    { name: 'Country', selector: './td[2]' },
  ],
}

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const rows: ScrapedRow[] = [
  row({ Rank: '1', Country: 'Poland' }),
  row({ Rank: '2', Country: 'Spain' }, false, 1),
  row({ Rank: '', Country: '' }, true, 2),
]

const state = (data: ScrapedRow[] = rows): SidePanelConfig => ({
  scrapeResult: { data, columnOrder: ['Rank', 'Country'] },
  resultProducingConfig: config,
})

/** Pretend `tabs` are open, each with the stored state it is paired with. */
const openTabs = async (
  tabs: { id: number; title: string; url: string; state?: SidePanelConfig }[],
) => {
  const asTabs = tabs.map(({ id, title, url }) => ({ id, title, url }) as Browser.tabs.Tab)
  spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue(asTabs as never)
  spyOnBrowser(fakeBrowser.tabs, 'get').mockImplementation((tabId: number) => {
    const found = asTabs.find((tab) => tab.id === tabId)
    return found ? Promise.resolve(found) : Promise.reject(new Error('No tab with id'))
  })
  for (const tab of tabs) {
    if (tab.state) await storage.setItem(`session:sidepanel_config_${tab.id}`, tab.state)
  }
}

/** Open one tab holding `data`, and point the page at it. */
const openSingleTab = (data: ScrapedRow[] = rows) =>
  openTabs([{ id: 1, title: 'Populations', url: 'https://example.com/pop', state: state(data) }])

const render = () =>
  renderSettled(
    <ConsentProvider>
      <ThemeProvider>
        <FullDataViewApp />
      </ThemeProvider>
    </ConsentProvider>,
  )

/** Render and let the mount-time tab scan settle, not just the storage read. */
const renderLoaded = async () => {
  view = await render()
  await act(async () => {
    await flush()
  })
  return view
}

/** Give storage watchers and awaited effects a macrotask to run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const text = () => view.container.textContent ?? ''
const bodyRows = () => [...view.container.querySelectorAll('tbody tr')]
const headers = () => [...view.container.querySelectorAll('th')].map((th) => th.textContent?.trim())
const button = (label: string) =>
  view.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const allButtons = (label: string) => [
  ...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
]
const byText = (label: string): HTMLButtonElement => {
  const found = [...view.container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  )
  if (!found) throw new Error(`No button starting with "${label}"`)
  return found
}

beforeEach(async () => {
  fakeBrowser.reset()
  window.history.replaceState({}, '', '/full-data-view.html?tabId=1')
  await storage.setItem(consentKey, true)
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue([] as never)
})

afterEach(async () => {
  vi.unstubAllGlobals()
})

describe('FullDataViewApp', () => {
  it('says it is loading before the scan finishes', async () => {
    spyOnBrowser(fakeBrowser.tabs, 'query').mockReturnValue(new Promise(() => {}) as never)

    view = await render()

    expect(text()).toContain('Loading data...')
  })

  it('reports a scan it could not complete, and can retry', async () => {
    spyOnBrowser(fakeBrowser.tabs, 'query').mockRejectedValue(new Error('tabs unavailable'))
    await renderLoaded()
    expect(text()).toContain('Failed to load tab data: tabs unavailable')

    await openSingleTab()
    await act(async () => {
      byText('Retry').click()
      await flush()
    })

    expect(text()).toContain('Populations')
  })

  it('says so when no tab holds any data', async () => {
    await openTabs([{ id: 1, title: 'Blank', url: 'https://example.com' }])

    await renderLoaded()

    expect(text()).toContain('No scraped data found in any tabs')
  })

  it('asks for a consent decision before showing anything', async () => {
    await storage.removeItem(consentKey)
    await openSingleTab()

    await renderLoaded()

    expect(text()).toContain('Help improve Scrape Similar')
    expect(text()).not.toContain('Rows per page')
  })

  it('shows the data of the tab it was opened for', async () => {
    await openTabs([
      { id: 1, title: 'First', url: 'https://example.com/1', state: state() },
      { id: 2, title: 'Second', url: 'https://example.com/2', state: state() },
    ])
    window.history.replaceState({}, '', '/full-data-view.html?tabId=2')

    await renderLoaded()

    expect(text()).toContain('Second')
    expect(document.title).toBe('Second - Extracted Data - Scrape Similar')
  })

  it('falls back to the first tab with data when none was requested', async () => {
    window.history.replaceState({}, '', '/full-data-view.html')
    await openTabs([
      { id: 1, title: 'Blank', url: 'https://example.com/blank' },
      { id: 2, title: 'Second', url: 'https://example.com/2', state: state() },
    ])

    await renderLoaded()

    expect(text()).toContain('Second')
  })

  it('renders a column per scraped field, plus the row controls', async () => {
    await openSingleTab()

    await renderLoaded()

    expect(headers()).toEqual(['', '#', 'Actions', 'Rank', 'Country'])
    expect(bodyRows()).toHaveLength(2)
    expect(bodyRows()[0]?.textContent).toContain('Poland')
  })

  it('hides the empty rows until asked for them', async () => {
    await openSingleTab()
    await renderLoaded()
    expect(text()).toContain('Show 1 empty rows')

    await act(() => view.container.querySelector<HTMLElement>('#show-empty-rows')!.click())

    expect(bodyRows()).toHaveLength(3)
    expect(text()).toContain('3 total rows')
  })

  it('offers no empty-row toggle when every row has data', async () => {
    await openSingleTab([row({ Rank: '1', Country: 'Poland' })])

    await renderLoaded()

    expect(view.container.querySelector('#show-empty-rows')).toBeNull()
    expect(text()).toContain('1 rows with data')
  })

  describe('searching', () => {
    const search = () =>
      view.container.querySelector<HTMLInputElement>('input[placeholder="Search all columns..."]')!

    it('narrows the table to the matching rows', async () => {
      await openSingleTab()
      await renderLoaded()

      fireEvent.change(search(), { target: { value: 'Poland' } })

      expect(bodyRows()).toHaveLength(1)
      expect(text()).toContain('1 filtered rows')
    })

    it('says when nothing matches', async () => {
      await openSingleTab()
      await renderLoaded()

      fireEvent.change(search(), { target: { value: 'Peru' } })

      expect(text()).toContain('No data found')
    })

    it('drops the empty rows again, since they never match', async () => {
      await openSingleTab()
      await renderLoaded()
      await act(() => view.container.querySelector<HTMLElement>('#show-empty-rows')!.click())

      fireEvent.change(search(), { target: { value: 'Poland' } })

      expect(view.container.querySelector('#show-empty-rows')).toBeNull()
    })

    it('records the search once the typing stops', async () => {
      vi.useFakeTimers()
      try {
        await openSingleTab()
        view = await render()
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        fireEvent.change(search(), { target: { value: 'Poland' } })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000)
        })

        expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_SEARCH, {
          search_term_length: 6,
          filtered_rows: 1,
          total_rows: 3,
        })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('a row', () => {
    it('can be highlighted on the page it came from', async () => {
      const update = spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      const sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
        {} as never,
      )
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Highlight this element')[1]!.click()
        await flush()
      })

      expect(update).toHaveBeenCalledWith(1, { active: true })
      expect(sendMessage).toHaveBeenCalledWith(
        1,
        { type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT, payload: { selector: '(//tr)[2]' } },
        expect.any(Function),
      )
    })

    it('reports a content script that never answered', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
        (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
          setLastError({ message: 'Receiving end does not exist' })
          callback?.(undefined)
          setLastError(undefined)
          return Promise.resolve(undefined)
        },
      )
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Highlight this element')[0]!.click()
        await flush()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('content script'))
    })

    it('says nothing when the highlight lands', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
        (_tabId: number, _message: unknown, callback?: (response: unknown) => void) => {
          callback?.({ success: true })
          return Promise.resolve({ success: true })
        },
      )
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Highlight this element')[0]!.click()
        await flush()
      })

      expect(toastMocks.toast.error).not.toHaveBeenCalled()
    })

    it('reports a tab it could not activate', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockRejectedValue(new Error('no such tab'))
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Highlight this element')[0]!.click()
        await flush()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to activate tab for highlighting')
    })

    it('can be copied as TSV', async () => {
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Copy this row')[0]!.click()
        await flush()
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1\tPoland')
      expect(toastMocks.toast.success).toHaveBeenCalledWith('Copied row to clipboard')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
        rows_copied: 1,
        columns_count: 2,
        export_type: 'full_data_view_row',
      })
    })

    it('reports a clipboard the browser refused', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        allButtons('Copy this row')[0]!.click()
        await flush()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to copy')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    })

    it('offers no controls for an empty row', async () => {
      await openSingleTab()
      await renderLoaded()
      await act(() => view.container.querySelector<HTMLElement>('#show-empty-rows')!.click())

      const controls = [...bodyRows()[2]!.querySelectorAll('td')[2]!.querySelectorAll('button')]
      expect(controls).toHaveLength(2)
      expect(controls.every((candidate) => candidate.disabled)).toBe(true)
    })
  })

  describe('selecting rows', () => {
    const checkboxes = () => [
      ...view.container.querySelectorAll<HTMLElement>('button[role="checkbox"]'),
    ]

    it('reports how many of the filtered rows are picked', async () => {
      await openSingleTab()
      await renderLoaded()

      await userEvent.click(checkboxes()[1]!)

      expect(text()).toContain('1 of 2 rows selected')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_ROW_SELECTION, {
        selection_type: 'select_individual',
        is_empty_row: false,
        total_selected: 1,
      })
    })

    it('records a row being unpicked', async () => {
      await openSingleTab()
      await renderLoaded()
      const checkbox = allButtons('Select row')[0]!

      await userEvent.click(checkbox)
      trackEvent.mockClear()
      await userEvent.click(checkbox)

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_ROW_SELECTION, {
        selection_type: 'deselect_individual',
        is_empty_row: false,
        total_selected: 0,
      })
    })

    it('picks and drops the whole page at once', async () => {
      await openSingleTab()
      await renderLoaded()

      await userEvent.click(checkboxes()[0]!)
      expect(text()).toContain('2 of 2 rows selected')

      await userEvent.click(checkboxes()[0]!)

      expect(text()).not.toContain('rows selected')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_ROW_SELECTION, {
        selection_type: 'deselect_all',
        rows_affected: 2,
        total_rows: 2,
      })
    })
  })

  describe('sorting', () => {
    it('orders by a column when its header is clicked', async () => {
      await openSingleTab()
      await renderLoaded()

      const countryHeader = [...view.container.querySelectorAll<HTMLElement>('th')].find((th) =>
        th.textContent?.startsWith('Country'),
      )!
      await userEvent.click(countryHeader)

      expect(bodyRows()[0]?.textContent).toContain('Poland')

      await userEvent.click(countryHeader)

      expect(bodyRows()[0]?.textContent).toContain('Spain')
    })

    it('orders the empty rows in with the rest when they are shown', async () => {
      await openSingleTab()
      await renderLoaded()
      await act(() => view.container.querySelector<HTMLElement>('#show-empty-rows')!.click())

      const countryHeader = [...view.container.querySelectorAll<HTMLElement>('th')].find((th) =>
        th.textContent?.startsWith('Country'),
      )!
      await userEvent.click(countryHeader)

      expect(bodyRows()).toHaveLength(3)
      expect(bodyRows()[1]?.textContent).toContain('Poland')
      expect(bodyRows()[2]?.textContent).toContain('Spain')
    })
  })

  describe('pagination', () => {
    const manyRows = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        row({ Rank: String(i + 1), Country: `C${i}` }, false, i),
      )

    it('shows one page at a time', async () => {
      await openSingleTab(manyRows(45))

      await renderLoaded()

      expect(bodyRows()).toHaveLength(20)
      expect(text()).toContain('Page 1 of 3')
    })

    it('steps between the pages', async () => {
      await openSingleTab(manyRows(45))
      await renderLoaded()

      await userEvent.click(button('Next page'))
      expect(text()).toContain('Page 2 of 3')

      await userEvent.click(button('Previous page'))

      expect(text()).toContain('Page 1 of 3')
      expect(button('Previous page').disabled).toBe(true)
    })

    it('hides the controls when everything fits on one page', async () => {
      await openSingleTab()

      await renderLoaded()

      expect(view.container.querySelector('button[aria-label="Next page"]')).toBeNull()
    })

    it('changes how many rows a page holds', async () => {
      await openSingleTab(manyRows(45))
      await renderLoaded()

      await userEvent.click(byText('20'))
      await act(() => {
        const option = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
          (item) => item.textContent === '50',
        )
        option!.click()
      })

      expect(bodyRows()).toHaveLength(45)
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_PAGE_SIZE_CHANGE, {
        previous_page_size: 20,
        new_page_size: 50,
        total_rows: 45,
      })
    })
  })

  it('names the columns from the config when the scrape recorded no order', async () => {
    await openTabs([
      {
        id: 1,
        title: 'Populations',
        url: 'https://example.com/pop',
        state: { scrapeResult: { data: rows, columnOrder: [] }, resultProducingConfig: config },
      },
    ])

    await renderLoaded()

    expect(headers()).toEqual(['', '#', 'Actions', 'Rank', 'Country'])
  })

  it('highlights the resize handle while a column is being dragged', async () => {
    await openSingleTab()
    await renderLoaded()
    const handle = view.container.querySelector<HTMLElement>('.cursor-col-resize')!

    expect(handle.className).toContain('opacity-0')

    await act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }))
    })

    expect(view.container.querySelector<HTMLElement>('.cursor-col-resize')!.className).toContain(
      'bg-primary opacity-100',
    )
  })

  describe('switching tabs', () => {
    it('shows the data of the tab picked from the list', async () => {
      await openTabs([
        { id: 1, title: 'First', url: 'https://example.com/1', state: state() },
        {
          id: 2,
          title: 'Second',
          url: 'https://example.com/2',
          state: state([row({ Rank: '9', Country: 'Peru' })]),
        },
      ])
      await renderLoaded()

      await userEvent.click(byText('First'))
      await act(() => {
        const option = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((item) =>
          item.textContent?.includes('Second'),
        )
        option!.click()
      })

      expect(text()).toContain('Peru')
      expect(new URL(window.location.href).searchParams.get('tabId')).toBe('2')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_TAB_SWITCH, {
        total_tabs_available: 2,
      })
    })

    it('narrows the list by title or address, and to nothing when neither matches', async () => {
      await openTabs([
        { id: 1, title: 'First', url: 'https://example.com/alpha', state: state() },
        {
          id: 2,
          title: 'Second',
          url: 'https://example.com/beta',
          state: state([row({ Rank: '9', Country: 'Peru' })]),
        },
      ])
      await renderLoaded()
      await userEvent.click(byText('First'))
      const search = document.body.querySelector<HTMLInputElement>(
        'input[placeholder="Search tabs..."]',
      )!
      const options = () => [...document.querySelectorAll('[cmdk-item]')].length

      // Matches the second tab's address but neither title.
      fireEvent.change(search, { target: { value: 'beta' } })
      expect(options()).toBe(1)

      // Matches the first tab's title but neither address.
      fireEvent.change(search, { target: { value: 'First' } })
      expect(options()).toBe(1)

      fireEvent.change(search, { target: { value: 'nothing at all' } })
      expect(options()).toBe(0)
    })
  })

  describe('going back to the scraped tab', () => {
    it('activates the tab, reopens the panel and closes itself', async () => {
      const update = spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      const open = spyOnBrowser(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined as never)
      const getCurrent = spyOnBrowser(fakeBrowser.tabs, 'getCurrent').mockResolvedValue({
        id: 99,
      } as never)
      const remove = spyOnBrowser(fakeBrowser.tabs, 'remove').mockResolvedValue(undefined as never)
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        byText('Back to Tab').click()
        await flush()
      })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FULL_DATA_VIEW_BACK_TO_TAB)
      expect(update).toHaveBeenCalledWith(1, { active: true })
      expect(open).toHaveBeenCalledWith({ tabId: 1 })
      expect(getCurrent).toHaveBeenCalled()
      expect(remove).toHaveBeenCalledWith(99)
    })

    it('still closes itself when the panel refuses to reopen', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      spyOnBrowser(fakeBrowser.sidePanel, 'open').mockRejectedValue(new Error('no user gesture'))
      spyOnBrowser(fakeBrowser.tabs, 'getCurrent').mockResolvedValue({ id: 99 } as never)
      const remove = spyOnBrowser(fakeBrowser.tabs, 'remove').mockResolvedValue(undefined as never)
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        byText('Back to Tab').click()
        await flush()
      })

      expect(remove).toHaveBeenCalledWith(99)
    })

    it('leaves itself open when the browser reports no current tab', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      spyOnBrowser(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined as never)
      spyOnBrowser(fakeBrowser.tabs, 'getCurrent').mockResolvedValue(undefined as never)
      const remove = spyOnBrowser(fakeBrowser.tabs, 'remove').mockResolvedValue(undefined as never)
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        byText('Back to Tab').click()
        await flush()
      })

      expect(remove).not.toHaveBeenCalled()
      expect(toastMocks.toast.error).not.toHaveBeenCalled()
    })

    it('reports a tab it could not go back to', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'update').mockRejectedValue(new Error('no such tab'))
      await openSingleTab()
      await renderLoaded()

      await act(async () => {
        byText('Back to Tab').click()
        await flush()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to switch back to tab')
    })
  })
})
