import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { FullDataViewApp } from '@/entrypoints/full-data-view/FullDataViewApp'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import type { ScrapeConfig, ScrapedRow, SidePanelConfig } from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { type RenderResult, act, render as renderComponent, waitFor } from '@testing-library/react'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

// `isDevOrTest` is a build-time constant; the debug-level watcher only does
// anything in production builds, so it needs a mutable mock to be reachable.
const modeFlags = vi.hoisted(() => ({ isDev: false, isTest: true, isDevOrTest: true }))
vi.mock('@/utils/modeTest', () => ({
  get isDev() {
    return modeFlags.isDev
  },
  get isTest() {
    return modeFlags.isTest
  },
  get isDevOrTest() {
    return modeFlags.isDevOrTest
  },
}))

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

let view: RenderResult

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

const row = (rank: string, originalIndex = 0): ScrapedRow => ({
  data: { Rank: rank },
  metadata: { originalIndex, isEmpty: false },
})

const state = (data: ScrapedRow[]): SidePanelConfig => ({
  scrapeResult: { data, columnOrder: ['Rank'] },
  resultProducingConfig: config,
  currentScrapeConfig: config,
})

interface TabSpec {
  id: number
  title?: string
  url?: string
  state?: SidePanelConfig
}

/** The tabs the fake browser currently reports, so a close can drop one. */
let openTabList: Browser.tabs.Tab[] = []

/** Pretend `tabs` are open, each with the stored state it is paired with. */
const openTabs = async (tabs: TabSpec[]) => {
  openTabList = tabs.map(
    ({ id, title, url }) =>
      ({
        id,
        ...(title === undefined ? {} : { title }),
        ...(url === undefined ? {} : { url }),
      }) as Browser.tabs.Tab,
  )
  spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
    () => Promise.resolve(openTabList) as never,
  )
  spyOnBrowser(fakeBrowser.tabs, 'get').mockImplementation((tabId: number) => {
    const found = openTabList.find((tab) => tab.id === tabId)
    return found ? Promise.resolve(found) : Promise.reject(new Error('No tab with id'))
  })
  for (const tab of tabs) {
    if (tab.state) await storage.setItem(`session:sidepanel_config_${tab.id}`, tab.state)
  }
}

/** Render, and let mount-time storage reads settle before asserting. */
const render = async () => {
  const rendered = renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <FullDataViewApp />
      </ThemeProvider>
    </ConsentProvider>,
  )
  await act(async () => {})
  return rendered
}

const renderLoaded = async () => {
  view = await render()
  await act(async () => {
    await flushMicrotasks()
  })
  return view
}

const text = () => view.container.textContent ?? ''

const urlTabId = () => new URL(window.location.href).searchParams.get('tabId')

/** Write `next` for `tabId`, and let the watcher react. */
const writeState = async (tabId: number, next: SidePanelConfig | null) => {
  await act(async () => {
    await storage.setItem(`session:sidepanel_config_${tabId}`, next)
    await flushMicrotasks()
    await flushMicrotasks()
  })
}

beforeEach(async () => {
  fakeBrowser.reset()
  modeFlags.isDevOrTest = true
  openTabList = []
  window.history.replaceState({}, '', '/full-data-view.html?tabId=1')
  await storage.setItem(consentKey, true)
  spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue([] as never)
})

describe('following storage while the view is open', () => {
  it('picks up newer rows for the tab on show', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()
    expect(text()).toContain('1 rows')

    await writeState(1, state([row('1'), row('2', 1)]))

    await waitFor(() => expect(text()).toContain('2 rows'))
  })

  it('adds a tab that gains data while the view is open', async () => {
    await openTabs([
      { id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) },
      { id: 2, title: 'Later', url: 'https://b' },
    ])
    await renderLoaded()

    await writeState(2, state([row('9')]))

    // The tab on show does not change, but the new one joins the list.
    expect(urlTabId()).toBe('1')
    await waitFor(() => expect(text()).toContain('Populations'))
  })

  it('drops a tab whose data is cleared and moves to the next one', async () => {
    await openTabs([
      { id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) },
      { id: 2, title: 'Second', url: 'https://b', state: state([row('9')]) },
    ])
    await renderLoaded()
    expect(urlTabId()).toBe('1')

    await writeState(1, state([]))

    await waitFor(() => expect(urlTabId()).toBe('2'))
    expect(text()).toContain('Second')
  })

  it('empties the view when the last tab’s data is cleared', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    await writeState(1, state([]))

    await waitFor(() => expect(text()).toContain('No Data Available'))
  })

  it('leaves the shown tab alone when another tab’s data is cleared', async () => {
    await openTabs([
      { id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) },
      { id: 2, title: 'Second', url: 'https://b', state: state([row('9')]) },
    ])
    await renderLoaded()

    await writeState(2, state([]))

    expect(urlTabId()).toBe('1')
    await waitFor(() => expect(text()).toContain('Populations'))
  })

  it('selects the first tab to gain data when none was showing', async () => {
    window.history.replaceState({}, '', '/full-data-view.html')
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    // Clearing it leaves nothing selected; the next write selects it again.
    await writeState(1, state([]))
    await waitFor(() => expect(text()).toContain('No Data Available'))

    await writeState(1, state([row('5')]))

    await waitFor(() => expect(urlTabId()).toBe('1'))
  })

  it('ignores a write for a tab that has since closed', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()
    spyOnBrowser(fakeBrowser.tabs, 'get').mockRejectedValue(new Error('No tab with id 1'))

    await writeState(1, state([row('1'), row('2', 1)]))

    expect(text()).toContain('1 rows')
  })

  it('falls back to placeholders for a tab with no title or URL', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()
    spyOnBrowser(fakeBrowser.tabs, 'get').mockResolvedValue({ id: 1 } as never)

    await writeState(1, { scrapeResult: { data: [row('1')], columnOrder: ['Rank'] } })

    await waitFor(() => expect(text()).toContain('Unknown Title'))
  })

  it('watches a tab opened after the view was', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    await act(async () => {
      await fakeBrowser.tabs.onCreated.trigger({ id: 3, title: 'Fresh', url: 'https://c' } as never)
      await flushMicrotasks()
    })
    spyOnBrowser(fakeBrowser.tabs, 'get').mockResolvedValue({
      id: 3,
      title: 'Fresh',
      url: 'https://c',
    } as never)

    await writeState(3, state([row('7')]))

    await waitFor(() => expect(text()).toContain('Populations'))
  })

  it('skips a created tab the browser gives no id for', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    await act(async () => {
      await fakeBrowser.tabs.onCreated.trigger({ title: 'Idless' } as never)
      await flushMicrotasks()
    })

    expect(text()).toContain('Populations')
  })

  it('skips a tab the browser lists without an id', async () => {
    spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue([
      { id: 1, title: 'Populations', url: 'https://a' },
      { title: 'Idless' },
    ] as never)
    await storage.setItem(`session:sidepanel_config_1`, state([row('1')]))

    await renderLoaded()

    expect(text()).toContain('Populations')
  })
})

describe('when a tab closes', () => {
  const closeTab = async (tabId: number) => {
    openTabList = openTabList.filter((tab) => tab.id !== tabId)
    await storage.removeItem(`session:sidepanel_config_${tabId}`)
    await act(async () => {
      await fakeBrowser.tabs.onRemoved.trigger(tabId, {
        windowId: 1,
        isWindowClosing: false,
      })
      await flushMicrotasks()
    })
  }

  it('moves to the next tab when the one on show closes', async () => {
    await openTabs([
      { id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) },
      { id: 2, title: 'Second', url: 'https://b', state: state([row('9')]) },
    ])
    await renderLoaded()

    await closeTab(1)

    await waitFor(() => expect(urlTabId()).toBe('2'))
    expect(text()).toContain('Second')
  })

  it('empties the view when the last tab closes', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    await closeTab(1)

    await waitFor(() => expect(text()).toContain('No Data Available'))
  })

  it('leaves the shown tab alone when another one closes', async () => {
    await openTabs([
      { id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) },
      { id: 2, title: 'Second', url: 'https://b', state: state([row('9')]) },
    ])
    await renderLoaded()

    await closeTab(2)

    expect(urlTabId()).toBe('1')
    await waitFor(() => expect(text()).toContain('Populations'))
  })
})

describe('the debug log level', () => {
  it('is forced to trace in dev and test builds', async () => {
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
    await storage.setItem('local:debugMode', false)
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])

    await renderLoaded()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('follows the stored flag in production builds', async () => {
    modeFlags.isDevOrTest = false
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
    await storage.setItem('local:debugMode', false)
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()

    expect(setLevel).toHaveBeenCalledWith('error')

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushMicrotasks()
    })
    expect(setLevel).toHaveBeenCalledWith('trace')

    await act(async () => {
      await storage.setItem('local:debugMode', false)
      await flushMicrotasks()
    })
    expect(setLevel).toHaveBeenLastCalledWith('error')
  })

  it('starts at trace in a production build with debug mode already on', async () => {
    modeFlags.isDevOrTest = false
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
    await storage.setItem('local:debugMode', true)
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])

    await renderLoaded()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('ignores stored changes in dev and test builds', async () => {
    await openTabs([{ id: 1, title: 'Populations', url: 'https://a', state: state([row('1')]) }])
    await renderLoaded()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushMicrotasks()
    })

    expect(setLevel).not.toHaveBeenCalled()
  })
})
