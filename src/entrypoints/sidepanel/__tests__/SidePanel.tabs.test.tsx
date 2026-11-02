// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidePanel } from '@/entrypoints/sidepanel/SidePanel'
import { LIVE_TAB_PANEL_CAP } from '@/entrypoints/sidepanel/tab-panels'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { getPresets, getRecentMainSelectors, userPresetsItem } from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import {
  MESSAGE_TYPES,
  type Message,
  type Preset,
  type ScrapeConfig,
  type SidePanelConfig,
} from '@/utils/types'
import { outlastBlurCommit } from '@@/tests/support/blur-commit'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
import { act, fireEvent, screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const TAB_ID = 4
const OTHER_TAB_ID = 7
const WINDOW_ID = 1
const PAGE_URL = 'https://example.com/table'

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

/**
 * Pretend the panel is attached to `url`, with `state` already stored for it.
 *
 * Pass `null` for a tab the browser reports without a URL at all.
 */
const attachToTab = async (url: string | null = PAGE_URL, state?: SidePanelConfig) => {
  spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
    (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
      const tab =
        url === null
          ? { id: TAB_ID, windowId: WINDOW_ID }
          : { id: TAB_ID, windowId: WINDOW_ID, url }
      const tabs = [tab as Browser.tabs.Tab]
      callback?.(tabs)
      return Promise.resolve(tabs)
    },
  )
  if (state) await storage.setItem(`session:sidepanel_config_${TAB_ID}`, state)
}

/** Pretend the browser reports no active tab at all. */
const attachToNothing = () =>
  spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
    (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
      callback?.([])
      return Promise.resolve([])
    },
  )

const contentScriptReplies = (response: unknown, lastError?: { message?: string }) =>
  spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
    (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
      setLastError(lastError)
      callback?.(response)
      setLastError(undefined)
      return Promise.resolve(response)
    },
  )

/** Report `tab` (or a `lastError`) for any `browser.tabs.get`. */
const tabsGetReplies = (tab: Partial<Browser.tabs.Tab>, lastError?: { message?: string }) =>
  spyOnBrowser(fakeBrowser.tabs, 'get').mockImplementation(
    (_tabId: number, callback?: (found: Browser.tabs.Tab) => void) => {
      setLastError(lastError)
      callback?.(tab as Browser.tabs.Tab)
      setLastError(undefined)
      return Promise.resolve(tab as Browser.tabs.Tab)
    },
  )

const render = () =>
  renderSettled(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <SidePanel debugMode={false} onDebugModeChange={() => {}} />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

/** Hidden panels stay in the DOM under a `display: none` ancestor. */
const isShown = (element: Element) => !element.closest('[style*="display: none"]')

/** The main selector field of the panel on screen. */
const mainSelectorInput = () =>
  [...view.container.querySelectorAll<HTMLTextAreaElement>('textarea#mainSelector')].find(isShown)!

/** The main selector field of every live panel, shown or hidden. */
const allMainSelectorInputs = () => [
  ...view.container.querySelectorAll<HTMLTextAreaElement>('textarea#mainSelector'),
]

const activateTab = (tabId: number, windowId = WINDOW_ID) =>
  act(async () => {
    await fakeBrowser.tabs.onActivated.trigger({ tabId, windowId })
  })

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  await userPresetsItem.setValue([])
  await storage.setItem(analyticsConsentItem.key, true)
  // A background that accepts every write: the panel reverts one it reports as failed.
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({ success: true })
  contentScriptReplies({ success: true, matchCount: 3 })
  await attachToTab()
})

describe('resolving the attached tab', () => {
  it('reports a query the browser refused', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
      (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
        setLastError({ message: 'no tabs permission' })
        callback?.([])
        setLastError(undefined)
        return Promise.resolve([])
      },
    )

    view = await render()

    expect(errorSpy).toHaveBeenCalledWith('Error querying tabs:', 'no tabs permission')
  })

  it('reports a window with no active tab', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    attachToNothing()

    view = await render()

    expect(errorSpy).toHaveBeenCalledWith('No active tab found in last focused window')
  })

  it('treats a tab with no URL as a blank one', async () => {
    await attachToTab(null)

    view = await render()

    // A blank URL is not injectable, so the panel explains itself instead.
    expect(view.container.textContent).toContain('Unsupported URL')
  })
})

describe('following the active tab', () => {
  it('loads the newly activated tab’s stored config', async () => {
    view = await render()
    await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
      currentScrapeConfig: { ...config, mainSelector: '//li' },
    })
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })

    await activateTab(OTHER_TAB_ID)

    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
  })

  it('starts the newly activated tab blank when nothing is stored', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })

    await activateTab(OTHER_TAB_ID)

    await waitFor(() => expect(mainSelectorInput().value).toBe(''))
  })

  it('stays on its tab when the activated one cannot be read, as a just-closed tab cannot', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    tabsGetReplies({}, { message: 'No tab with id 7' })

    await activateTab(OTHER_TAB_ID)

    expect(errorSpy).toHaveBeenCalledWith('Error getting tab info:', expect.anything())
    expect(allMainSelectorInputs()).toHaveLength(1)
    expect(mainSelectorInput().value).toBe('//tr')
  })

  it('follows a URL change in the tab it is attached to', async () => {
    view = await render()
    tabsGetReplies({ id: TAB_ID, url: 'chrome://settings' })

    await act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { url: 'chrome://settings' }, {} as never)
    })

    await waitFor(() => expect(view.container.textContent).toContain('Unsupported URL'))
  })

  it('ignores a URL change in a tab it is not attached to', async () => {
    view = await render()
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'chrome://settings' })

    await act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(
        OTHER_TAB_ID,
        { url: 'chrome://settings' },
        {} as never,
      )
    })

    expect(get).not.toHaveBeenCalled()
  })

  it('ignores a tab activated in another window', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })

    await activateTab(OTHER_TAB_ID, WINDOW_ID + 1)

    expect(get).not.toHaveBeenCalled()
    expect(mainSelectorInput().value).toBe('//tr')
  })

  it('applies an activation that arrives before its own window is known', async () => {
    let answerQuery: (() => void) | undefined
    spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
      (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
        const tabs = [{ id: TAB_ID, windowId: WINDOW_ID, url: PAGE_URL } as Browser.tabs.Tab]
        answerQuery = () => callback?.(tabs)
        return Promise.resolve(tabs)
      },
    )
    await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
      currentScrapeConfig: { ...config, mainSelector: '//li' },
    })
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    view = await render()

    await activateTab(OTHER_TAB_ID + 1, WINDOW_ID + 1)
    await activateTab(OTHER_TAB_ID)
    act(() => answerQuery!())

    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
  })

  it('drops an early activation from another window', async () => {
    let answerQuery: (() => void) | undefined
    spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
      (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
        const tabs = [{ id: TAB_ID, windowId: WINDOW_ID, url: PAGE_URL } as Browser.tabs.Tab]
        answerQuery = () => callback?.(tabs)
        return Promise.resolve(tabs)
      },
    )
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    view = await render()

    await activateTab(OTHER_TAB_ID, WINDOW_ID + 1)
    act(() => answerQuery!())

    expect(get).not.toHaveBeenCalled()
  })

  it('keeps an early activation in its own window over a later one elsewhere', async () => {
    let answerQuery: (() => void) | undefined
    spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
      (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
        const tabs = [{ id: TAB_ID, windowId: WINDOW_ID, url: PAGE_URL } as Browser.tabs.Tab]
        answerQuery = () => callback?.(tabs)
        return Promise.resolve(tabs)
      },
    )
    await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
      currentScrapeConfig: { ...config, mainSelector: '//li' },
    })
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    view = await render()

    await activateTab(OTHER_TAB_ID)
    await activateTab(OTHER_TAB_ID + 1, WINDOW_ID + 1)
    act(() => answerQuery!())

    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(OTHER_TAB_ID, expect.any(Function))
  })

  it('takes the latest early activation when it cannot tell which window it is in', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    let answerQuery: (() => void) | undefined
    spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
      (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
        answerQuery = () => callback?.([])
        return Promise.resolve([])
      },
    )
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    view = await render()

    await activateTab(OTHER_TAB_ID + 1, WINDOW_ID + 1)
    await activateTab(OTHER_TAB_ID + 2, WINDOW_ID + 1)
    await activateTab(OTHER_TAB_ID)
    act(() => answerQuery!())

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(OTHER_TAB_ID, expect.any(Function))
  })

  it('follows every window when it cannot tell which one it is in', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    attachToNothing()
    await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
      currentScrapeConfig: { ...config, mainSelector: '//li' },
    })
    view = await render()
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })

    await activateTab(OTHER_TAB_ID, WINDOW_ID + 1)

    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
  })

  it('ignores stored data that arrives for a different tab', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await act(async () => {
      await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
        currentScrapeConfig: { ...config, mainSelector: '//li' },
      })
    })

    expect(mainSelectorInput().value).toBe('//tr')
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('without a tab to talk to', () => {
  beforeEach(() => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    attachToNothing()
  })

  it('still offers the config form', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Main Selector')
  })

  it('does not try to persist a config change', async () => {
    view = await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    act(() =>
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add column"]')!.click(),
    )
    await settleEffects()

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not try to highlight or open the picker', async () => {
    const sendMessage = contentScriptReplies({ success: true })
    view = await render()

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Open visual picker"]')!
        .click(),
    )
    fireEvent.change(mainSelectorInput(), { target: { value: '//td' } })
    // Both the button press and the deferred blur below commit the draft, which
    // would normally ask the page for a highlight.
    await act(async () => {
      ;[...view.container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === 'Validate selector')!
        .click()
      await Promise.resolve()
    })
    fireEvent.focusOut(mainSelectorInput())
    await outlastBlurCommit()

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('still lets the row list be highlighted without reaching the page', async () => {
    const sendMessage = contentScriptReplies({ success: true })
    view = await render()

    act(() =>
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add column"]')!.click(),
    )
    await settleEffects()

    expect(sendMessage).not.toHaveBeenCalled()
  })
})

describe('reading the stored state', () => {
  it('falls back to the live config when a stored result names none', async () => {
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      highlightMatchCount: 1,
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })

    view = await render()

    // The table is built from the current config, since none was recorded.
    await waitFor(() => expect(view.container.textContent).toContain('Extracted Data'))
    expect(view.container.querySelector('th')?.textContent).toBeDefined()
  })

  it('restores the config a stored result was produced by', async () => {
    const producing = { ...config, mainSelector: '//old' }
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      resultProducingConfig: producing,
      highlightMatchCount: 1,
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })

    view = await render()

    // The config has drifted from the one behind the results, so the button
    // offers a re-scrape rather than a first one.
    await waitFor(() =>
      expect(
        [...view.container.querySelectorAll('button')].some(
          (candidate) => candidate.textContent.trim() === 'Scrape',
        ),
      ).toBe(true),
    )
    expect(view.container.textContent).toContain('Extracted Data')
  })

  it('keeps a slow read for one tab out of another', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    // Hold the other tab's first read open, switch back underneath it, then let
    // it land.
    let release: ((value: SidePanelConfig | null) => void) | undefined
    const getItem = vi
      .spyOn(sidePanelConfigItem(OTHER_TAB_ID), 'getValue')
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    await activateTab(OTHER_TAB_ID)
    getItem.mockRestore()
    tabsGetReplies({ id: TAB_ID, url: PAGE_URL })
    await activateTab(TAB_ID)

    await act(async () => {
      release!({ currentScrapeConfig: { ...config, mainSelector: '//stale' } })
    })

    expect(mainSelectorInput().value).toBe('//tr')
  })

  it('blanks the URL of an activated tab that reports none', async () => {
    view = await render()
    tabsGetReplies({ id: OTHER_TAB_ID })

    await activateTab(OTHER_TAB_ID)

    // An empty URL is not injectable, so the panel explains itself.
    await waitFor(() => expect(view.container.textContent).toContain('Unsupported URL'))
  })

  it('ignores an update that leaves the URL alone', async () => {
    view = await render()

    await act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { status: 'loading' }, {} as never)
    })

    expect(mainSelectorInput()).toBeDefined()
  })
})

describe('remembering the selector a scrape used', () => {
  const withValidatedSelector = (mainSelector = '//tr') =>
    attachToTab(PAGE_URL, {
      currentScrapeConfig: { ...config, mainSelector },
      highlightMatchCount: 3,
    })

  /** Press the main action button, whatever it currently reads. */
  const scrape = async (response: unknown, label = 'Scrape') => {
    const sendMessage = contentScriptReplies(response)
    await act(async () => {
      ;[...view.container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === label)!
        .click()
      await Promise.resolve()
    })
    return sendMessage
  }

  const row = { data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }
  const scraped = { data: { data: [row], columnOrder: ['Rank'] }, success: true }

  it('adds a selector no preset covers to the recents', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape(scraped)

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual(['//tr']))
  })

  it('leaves a selector a preset already covers out of the recents', async () => {
    await userPresetsItem.setValue([
      {
        id: 'p1',
        name: 'Rows',
        config: { ...config, mainSelector: '//tr' },
        createdAt: 1_700_000_000_000,
      },
    ])
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape(scraped)

    await act(flushMicrotasks)
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('validates an edited selector instead of scraping the committed one', async () => {
    // #271: the press fired a scrape carrying the pre-edit selector, replacing
    // the results table with rows for a selector the user had moved away from.
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    act(() => mainSelectorInput().focus())
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })

    const sendMessage = await scrape(scraped, 'Validate selector')
    // A commit the press failed to cancel would land here.
    await outlastBlurCommit()

    expect(
      sendMessage.mock.calls.map(([, message]) => [
        (message as Message).type,
        (message as Message).payload,
      ]),
    ).toEqual([[MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, { selector: '//li' }]])
    await act(flushMicrotasks)
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('ignores a preset with no selector while checking the recents', async () => {
    await userPresetsItem.setValue([
      {
        id: 'p0',
        name: 'Empty',
        config: { mainSelector: '', columns: config.columns },
        createdAt: 1_700_000_000_000,
      },
    ])
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape(scraped)

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual(['//tr']))
  })

  it('leaves a selector that scraped no rows out of the recents', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape({ data: { data: [], columnOrder: ['Rank'] }, success: true })

    await waitFor(() => expect(view.container.textContent).toContain('0 found'))
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('remembers the selector without its surrounding whitespace', async () => {
    await withValidatedSelector('  //tr  ')
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape(scraped)

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual(['//tr']))
  })

  it('reports no rows for a reply that carries no data at all', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape({ success: true })

    await waitFor(() => expect(view.container.textContent).toContain('0 found'))
  })

  it('leaves the recents alone for a reply with rows that does not claim success', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape({ data: { data: [row] } })

    // No `success: true`, so nothing is remembered about the config used.
    await act(flushMicrotasks)
    expect(await getRecentMainSelectors()).toEqual([])
  })
})

describe('remembering a validated selector', () => {
  /** Commit an edited selector by leaving the field, which validates it. */
  const validate = async (selector: string, response: unknown) => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    const sendMessage = contentScriptReplies(response)

    fireEvent.change(mainSelectorInput(), { target: { value: selector } })
    fireEvent.focusOut(mainSelectorInput())
    await outlastBlurCommit()
    return sendMessage
  }

  it('adds a selector that matched elements to the recents', async () => {
    await validate('//td', { success: true, matchCount: 3 })

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual(['//td']))
  })

  it('leaves a selector that matched nothing out of the recents', async () => {
    const sendMessage = await validate('//td', { success: true, matchCount: 0 })
    await act(flushMicrotasks)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('leaves a selector that failed to parse out of the recents', async () => {
    const sendMessage = await validate('//td[', { success: false, error: 'Invalid XPath' })
    await act(flushMicrotasks)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('leaves a selector a preset already covers out of the recents', async () => {
    await userPresetsItem.setValue([
      {
        id: 'p1',
        name: 'Cells',
        config: { ...config, mainSelector: '//td' },
        createdAt: 1_700_000_000_000,
      },
    ])

    const sendMessage = await validate('//td', { success: true, matchCount: 3 })
    await act(flushMicrotasks)

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(await getRecentMainSelectors()).toEqual([])
  })
})

describe('presets', () => {
  const userPreset: Preset = {
    id: 'p1',
    name: 'Rows',
    config: { ...config, mainSelector: '//li' },
    createdAt: 1_700_000_000_000,
  }

  const byLabel = (label: string) =>
    [...view.container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent.trim() === label,
    )!

  /** Open the Load popover; its content is portalled onto the body. */
  const openPresetList = () => userEvent.click(byLabel('Load'))

  const presetRow = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((candidate) =>
      candidate.textContent.includes(name),
    )

  const waitForPreset = async (name: string) => {
    await openPresetList()
    await waitFor(() => expect(presetRow(name)).toBeDefined())
  }

  const loadPreset = async (name: string) => {
    await waitForPreset(name)
    await userEvent.click(presetRow(name)!)
  }

  const savePresetNamed = async (name: string) => {
    await userEvent.click(byLabel('Save'))
    const nameField = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Preset name"]',
    )!
    fireEvent.change(nameField, { target: { value: name } })
    await act(async () => {
      ;[...document.querySelectorAll<HTMLButtonElement>('[data-slot="drawer-content"] button')]
        .filter((candidate) => candidate.textContent.trim() === 'Save')
        .at(-1)!
        .click()
      await Promise.resolve()
    })
  }

  /** Outside hiding a system preset, only `getAllPresets` reads the status key, so this counts list loads. */
  const countPresetListLoads = () => vi.spyOn(systemPresetStatusItem, 'getValue')

  const deletePresetNamed = async (name: string) => {
    await waitForPreset(name)
    await userEvent.click(presetRow(name)!.querySelector<HTMLButtonElement>('button')!)
    await userEvent.click(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
        ['Delete', 'Hide'].includes(candidate.textContent.trim()),
      )!,
    )
  }

  it('records loading a user preset', async () => {
    await userPresetsItem.setValue([userPreset])
    view = await render()

    await loadPreset('Rows')

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_LOAD, {
      type: 'user',
      preset_name: null,
      preset_id: null,
    })
    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
  })

  it('names a system preset when one is loaded', async () => {
    const systemPreset = SYSTEM_PRESETS[0]!
    view = await render()

    await loadPreset(systemPreset.name)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_LOAD, {
      type: 'system',
      preset_name: systemPreset.name,
      preset_id: systemPreset.id,
    })
  })

  it('leaves the highlight alone for a preset with no selector', async () => {
    await userPresetsItem.setValue([
      { ...userPreset, config: { mainSelector: '', columns: config.columns } },
    ])
    view = await render()
    await waitForPreset('Rows')
    const sendMessage = contentScriptReplies({ success: true, matchCount: 3 })

    await userEvent.click(presetRow('Rows')!)

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('saves the current config as a preset', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config, highlightMatchCount: 3 })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    const listLoads = countPresetListLoads()

    await savePresetNamed('Mine')

    await waitFor(async () => expect((await getPresets())[0]?.name).toBe('Mine'))
    // The save drawer still locks pointer events on the body.
    fireEvent.click(byLabel('Load'))
    await waitFor(() => expect(presetRow('Mine')).toBeDefined())
    await act(flushMicrotasks)
    expect(listLoads).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_SAVE, {
      type: 'user',
      columns_count: 1,
    })
  })

  it('reports a preset it could not save', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await attachToTab(PAGE_URL, { currentScrapeConfig: config, highlightMatchCount: 3 })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    vi.spyOn(userPresetsItem, 'setValue').mockRejectedValue(new Error('quota exceeded'))

    await savePresetNamed('Mine')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Failed to save preset'))
  })

  it('deletes a user preset and says so', async () => {
    await userPresetsItem.setValue([userPreset])
    view = await render()
    const listLoads = countPresetListLoads()

    await deletePresetNamed('Rows')

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_DELETION, {
        type: 'user',
      }),
    )
    expect(toastMocks.toast.success).toHaveBeenCalled()
    // The closing confirmation still locks pointer events on the body.
    fireEvent.click(byLabel('Load'))
    await waitFor(() => expect(presetRow(SYSTEM_PRESETS[0]!.name)).toBeDefined())
    await waitFor(() => expect(presetRow('Rows')).toBeUndefined())
    await act(flushMicrotasks)
    expect(listLoads).toHaveBeenCalledTimes(1)
  })

  it('reports a preset it could not delete', async () => {
    await userPresetsItem.setValue([userPreset])
    view = await render()
    vi.spyOn(userPresetsItem, 'setValue').mockRejectedValue(new Error('quota exceeded'))

    await deletePresetNamed('Rows')

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalled())
  })

  it('hides a system preset rather than deleting it', async () => {
    const systemPreset = SYSTEM_PRESETS[0]!
    view = await render()

    await deletePresetNamed(systemPreset.name)

    await waitFor(async () =>
      expect(await storage.getItem(systemPresetStatusItem.key)).toEqual({
        [systemPreset.id]: false,
      }),
    )
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_HIDE, {
      type: 'system',
      preset_name: systemPreset.name,
      preset_id: systemPreset.id,
    })
  })

  it('picks up presets saved from another extension page', async () => {
    view = await render()
    await openPresetList()

    await act(async () => {
      await userPresetsItem.setValue([userPreset])
    })

    await waitFor(() => expect(presetRow('Rows')).toBeDefined())
  })

  it('picks up a system preset hidden from another extension page', async () => {
    const systemPreset = SYSTEM_PRESETS[0]!
    view = await render()
    await waitForPreset(systemPreset.name)

    await act(async () => {
      await storage.setItem(systemPresetStatusItem.key, { [systemPreset.id]: false })
    })

    await waitFor(() => expect(presetRow(systemPreset.name)).toBeUndefined())
  })

  it('picks up presets imported from the settings drawer', async () => {
    view = await render()
    const listLoads = countPresetListLoads()
    await userEvent.click(
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!,
    )
    const fileInput = document.body.querySelector<HTMLInputElement>('input[type="file"]')!

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [
          {
            text: () => Promise.resolve(JSON.stringify({ version: 1, presets: [userPreset] })),
          },
        ],
      })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      // The Settings row and the confirmation both read "Import"; the
      // confirmation is portalled, so it comes last in the document.
      ;[...document.querySelectorAll<HTMLButtonElement>('button')]
        .filter((candidate) => candidate.textContent.trim() === 'Import')
        .at(-1)!
        .click()
      await Promise.resolve()
    })

    await waitFor(async () => expect((await getPresets())[0]?.name).toBe('Rows'))
    // The settings drawer still locks pointer events on the body.
    fireEvent.click(byLabel('Load'))
    await waitFor(() => expect(presetRow('Rows')).toBeDefined())
    await act(flushMicrotasks)
    expect(listLoads).toHaveBeenCalledTimes(1)
  })

  it('falls back to the system presets when the user ones cannot be read', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    vi.spyOn(userPresetsItem, 'getValue').mockRejectedValue(new Error('storage unavailable'))

    view = await render()

    await waitForPreset(SYSTEM_PRESETS[0]!.name)
  })
})

describe('talking to the content script', () => {
  const CONNECT_ERROR =
    'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.'

  it('reports a picker toggle it could not deliver', async () => {
    view = await render()
    contentScriptReplies(undefined, { message: 'port closed' })

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Open visual picker"]')!
        .click(),
    )

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })

  it('says nothing when the picker toggle lands', async () => {
    view = await render()
    const sendMessage = contentScriptReplies({ success: true })

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Open visual picker"]')!
        .click(),
    )

    expect(sendMessage).toHaveBeenCalledWith(
      TAB_ID,
      { type: MESSAGE_TYPES.TOGGLE_PICKER_MODE, payload: { source: 'button' } },
      expect.any(Function),
    )
    expect(toastMocks.toast.error).not.toHaveBeenCalled()
  })

  it('records a highlight the content script could not deliver', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    contentScriptReplies(undefined, { message: 'port closed' })

    fireEvent.change(mainSelectorInput(), { target: { value: '//td' } })
    fireEvent.focusOut(mainSelectorInput())
    await outlastBlurCommit()

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })

  it('ignores a highlight reply that reports neither a count nor an error', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    contentScriptReplies({ success: true })

    fireEvent.change(mainSelectorInput(), { target: { value: '//td' } })
    fireEvent.focusOut(mainSelectorInput())
    await outlastBlurCommit()

    expect(toastMocks.toast.error).not.toHaveBeenCalled()
  })

  it('says nothing when a row highlight lands', async () => {
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      highlightMatchCount: 1,
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })
    view = await render()
    await waitFor(() =>
      expect(
        view.container.querySelector('button[aria-label="Highlight this element"]'),
      ).not.toBeNull(),
    )
    contentScriptReplies({ success: true })

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Highlight this element"]')!
        .click(),
    )

    expect(toastMocks.toast.error).not.toHaveBeenCalled()
  })

  it('says nothing when the picker refuses without an error', async () => {
    view = await render()
    contentScriptReplies({ success: false })

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Open visual picker"]')!
        .click(),
    )

    expect(toastMocks.toast.error).not.toHaveBeenCalled()
  })

  it('reports a row highlight it could not deliver', async () => {
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      highlightMatchCount: 1,
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })
    view = await render()
    await waitFor(() =>
      expect(
        view.container.querySelector('button[aria-label="Highlight this element"]'),
      ).not.toBeNull(),
    )
    contentScriptReplies(undefined, { message: 'port closed' })

    act(() =>
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Highlight this element"]')!
        .click(),
    )

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })
})

describe('one panel per tab', () => {
  const OTHER_URL = 'https://example.org/list'
  const otherConfig: ScrapeConfig = {
    mainSelector: '//tr',
    columns: [{ name: 'Name', selector: './td[2]' }],
  }

  /** Activate `tabId`, reporting `url` for it. */
  const switchTo = async (tabId: number, url = tabId === TAB_ID ? PAGE_URL : OTHER_URL) => {
    tabsGetReplies({ id: tabId, url })
    await activateTab(tabId)
  }

  const shownButton = (label: string) =>
    [...view.container.querySelectorAll('button')]
      .filter(isShown)
      .find((candidate) => candidate.textContent.trim() === label)

  const sidePanelWrites = (sendMessage: ReturnType<typeof spyOnBrowser>) =>
    sendMessage.mock.calls
      .map(([message]) => message as Message<typeof MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA>)
      .filter((message) => message.type === MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA)
      .map((message) => message.payload)

  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      data: { Rank: String(index + 1) },
      metadata: { originalIndex: index, isEmpty: false },
    }))

  beforeEach(async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config, highlightMatchCount: 3 })
    await storage.setItem(`session:sidepanel_config_${OTHER_TAB_ID}`, {
      currentScrapeConfig: otherConfig,
      highlightMatchCount: 3,
    })
  })

  it('keeps an uncommitted selector draft with its own tab', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    await switchTo(OTHER_TAB_ID)
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.focusOut(mainSelectorInput())
    await outlastBlurCommit()
    await switchTo(TAB_ID)

    expect(mainSelectorInput().value).toBe('//li')
    expect(sidePanelWrites(sendMessage)).toEqual([])
  })

  it('keeps an uncommitted draft while its tab visits an unsupported page', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    const navigate = (url: string) =>
      act(async () => {
        await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { url }, {} as never)
      })

    await navigate('chrome://settings')
    await waitFor(() => expect(view.container.textContent).toContain('Unsupported URL'))
    await navigate(PAGE_URL)

    await waitFor(() => expect(mainSelectorInput().value).toBe('//li'))
  })

  it('builds a held blur commit on config written while its tab was hidden, however slow the read', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    fireEvent.focusOut(mainSelectorInput())
    await switchTo(OTHER_TAB_ID)
    const guessedColumns = [{ name: 'Guessed', selector: './td[3]' }]
    // A guess that was in flight lands while the tab is in the background.
    const writtenWhileHidden: SidePanelConfig = {
      currentScrapeConfig: { ...config, columns: guessedColumns },
      highlightMatchCount: 3,
    }
    await act(async () => {
      await storage.setItem(`session:sidepanel_config_${TAB_ID}`, writtenWhileHidden)
    })
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )
    let release: ((value: SidePanelConfig | null) => void) | undefined
    const getItem = vi
      .spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))

    await switchTo(TAB_ID)
    getItem.mockRestore()
    // Longer than the blur's own delay: the commit waits for the read itself.
    await outlastBlurCommit()
    expect(sidePanelWrites(sendMessage)).toEqual([])
    await act(async () => {
      release!(writtenWhileHidden)
    })

    await waitFor(() =>
      expect(sidePanelWrites(sendMessage)[0]).toEqual({
        tabId: TAB_ID,
        updates: {
          currentScrapeConfig: { mainSelector: '//li' },
          highlightMatchCount: null,
          highlightError: null,
          panelConfigSeq: 1,
        },
      }),
    )
  })

  it('finishes a held blur commit in a tab with nothing stored', async () => {
    await storage.removeItem(`session:sidepanel_config_${OTHER_TAB_ID}`)
    view = await render()
    await switchTo(OTHER_TAB_ID)
    await waitFor(() => expect(mainSelectorInput().value).toBe(''))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    fireEvent.focusOut(mainSelectorInput())
    await switchTo(TAB_ID)
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    await switchTo(OTHER_TAB_ID)

    await waitFor(() =>
      expect(sidePanelWrites(sendMessage)[0]).toEqual({
        tabId: OTHER_TAB_ID,
        updates: {
          currentScrapeConfig: { mainSelector: '//li' },
          highlightMatchCount: null,
          highlightError: null,
          panelConfigSeq: 1,
        },
      }),
    )
  })

  it('drops a held blur commit once the field is focused again', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    fireEvent.focusOut(mainSelectorInput())
    let release: ((value: SidePanelConfig | null) => void) | undefined
    await switchTo(OTHER_TAB_ID)
    const getItem = vi
      .spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    await switchTo(TAB_ID)
    getItem.mockRestore()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    // Back in the field before the read lands: the user is editing again.
    act(() => mainSelectorInput().focus())
    await act(async () => {
      release!({ currentScrapeConfig: config, highlightMatchCount: 3 })
    })

    expect(sidePanelWrites(sendMessage)).toEqual([])
  })

  it('keeps a held blur commit when its tab is hidden again before the read lands', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    fireEvent.focusOut(mainSelectorInput())
    await switchTo(OTHER_TAB_ID)
    const getItem = vi
      .spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
      .mockImplementationOnce(() => new Promise(() => {}))
    await switchTo(TAB_ID)
    getItem.mockRestore()
    await switchTo(OTHER_TAB_ID)
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    await switchTo(TAB_ID)

    await waitFor(() =>
      expect(sidePanelWrites(sendMessage)[0]).toEqual({
        tabId: TAB_ID,
        updates: {
          currentScrapeConfig: { mainSelector: '//li' },
          highlightMatchCount: null,
          highlightError: null,
          panelConfigSeq: 1,
        },
      }),
    )
  })

  it('closes the suggestions of a tab hidden mid-edit', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    act(() => mainSelectorInput().focus())
    const shownSuggestions = () =>
      [...view.container.querySelectorAll('[cmdk-root]')].filter(isShown)
    await waitFor(() => expect(shownSuggestions()).toHaveLength(1))

    await switchTo(OTHER_TAB_ID)
    await switchTo(TAB_ID)

    expect(shownSuggestions()).toHaveLength(0)
  })

  it('holds a blur commit pending at hide until its tab is shown, then commits it there', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      success: true,
    })

    // The switch lands inside the blur's commit defer.
    fireEvent.focusOut(mainSelectorInput())
    await switchTo(OTHER_TAB_ID)
    await outlastBlurCommit()
    expect(sidePanelWrites(sendMessage)).toEqual([])

    await switchTo(TAB_ID)

    await waitFor(() =>
      expect(sidePanelWrites(sendMessage)[0]).toEqual({
        tabId: TAB_ID,
        updates: {
          currentScrapeConfig: { mainSelector: '//li' },
          highlightMatchCount: null,
          highlightError: null,
          panelConfigSeq: 1,
        },
      }),
    )
    // The highlight that follows the stored commit is stored for the same tab.
    await waitFor(() =>
      expect(sidePanelWrites(sendMessage)).toEqual([
        expect.objectContaining({ tabId: TAB_ID }),
        expect.objectContaining({ tabId: TAB_ID }),
      ]),
    )
  })

  it('keeps an open save drawer and its typed name with its own tab', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    await userEvent.click(shownButton('Save')!)
    const nameField = () =>
      [...document.querySelectorAll<HTMLInputElement>('input[placeholder="Preset name"]')].find(
        isShown,
      )
    fireEvent.change(nameField()!, { target: { value: 'Mine' } })
    expect(document.body.style.pointerEvents).toBe('none')

    await switchTo(OTHER_TAB_ID)
    expect(nameField()).toBeUndefined()
    // The modal's lock on the rest of the page is an effect, so hiding releases it.
    expect(document.body.style.pointerEvents).toBe('')

    await switchTo(TAB_ID)
    expect(nameField()?.value).toBe('Mine')
    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('keeps a running scrape with the tab it runs in', async () => {
    let reply: ((response: unknown) => void) | undefined
    spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
      (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
        reply = callback
        return Promise.resolve(undefined)
      },
    )
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    await act(async () => {
      shownButton('Scrape')!.click()
      await Promise.resolve()
    })
    const isShownScrapeRunning = () =>
      [...view.container.querySelectorAll('.animate-spin')].some(isShown)
    expect(isShownScrapeRunning()).toBe(true)

    await switchTo(OTHER_TAB_ID)
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    expect(isShownScrapeRunning()).toBe(false)

    await switchTo(TAB_ID)
    expect(isShownScrapeRunning()).toBe(true)
    act(() => reply!({ success: true, data: { data: [], columnOrder: ['Rank'] } }))
    expect(isShownScrapeRunning()).toBe(false)
  })

  it('keeps the results page with its own tab', async () => {
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      highlightMatchCount: 3,
      scrapeResult: { data: rows(25), columnOrder: ['Rank'] },
    })
    view = await render()
    await waitFor(() => expect(view.container.textContent).toContain('Page 1 of 3'))
    await userEvent.click(
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!,
    )
    await waitFor(() => expect(view.container.textContent).toContain('Page 2 of 3'))

    await switchTo(OTHER_TAB_ID)
    await switchTo(TAB_ID)
    // A write that leaves the rows as they were does not reset the page either.
    await act(async () => {
      await storage.setItem(`session:sidepanel_config_${TAB_ID}`, {
        currentScrapeConfig: config,
        highlightMatchCount: 4,
        scrapeResult: { data: rows(25), columnOrder: ['Rank'] },
      })
    })

    expect(view.container.textContent).toContain('Page 2 of 3')
  })

  it('scrolls to the results only when they arrive, not when the tab is shown again', async () => {
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      highlightMatchCount: 3,
      scrapeResult: { data: rows(2), columnOrder: ['Rank'] },
    })
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    view = await render()
    await waitFor(() => expect(view.container.textContent).toContain('Extracted Data'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    await switchTo(OTHER_TAB_ID)
    await switchTo(TAB_ID)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('stops following a hidden tab’s storage and catches up when shown', async () => {
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    await switchTo(OTHER_TAB_ID)

    await act(async () => {
      await storage.setItem(`session:sidepanel_config_${TAB_ID}`, {
        currentScrapeConfig: { ...config, mainSelector: '//td' },
      })
    })
    expect(allMainSelectorInputs().map((input) => input.value)).toEqual(['//tr', '//tr'])

    await switchTo(TAB_ID)
    await waitFor(() => expect(mainSelectorInput().value).toBe('//td'))
  })

  it('drops the panel of a closed tab', async () => {
    view = await render()
    await switchTo(OTHER_TAB_ID)
    expect(allMainSelectorInputs()).toHaveLength(2)

    await act(async () => {
      await fakeBrowser.tabs.onRemoved.trigger(TAB_ID, { windowId: 1, isWindowClosing: false })
    })

    expect(allMainSelectorInputs()).toHaveLength(1)
  })

  // Mounts a full panel for every tab up to the cap, which on a loaded CI runner
  // takes longer than the default 5 s; a test that times out keeps switching
  // tabs underneath the next one.
  it(
    'evicts the least recently shown panel past the cap and restores it from storage',
    {
      timeout: 30_000,
    },
    async () => {
      view = await render()
      for (let tabId = 100; tabId < 100 + LIVE_TAB_PANEL_CAP; tabId++) {
        await switchTo(tabId, OTHER_URL)
      }
      expect(allMainSelectorInputs()).toHaveLength(LIVE_TAB_PANEL_CAP)

      await switchTo(TAB_ID)

      await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
      expect(allMainSelectorInputs()).toHaveLength(LIVE_TAB_PANEL_CAP)
    },
  )

  it('shows the splash for an unsupported tab without dropping the others', async () => {
    view = await render()

    await switchTo(OTHER_TAB_ID, 'chrome://settings')

    await waitFor(() => expect(view.container.textContent).toContain('Unsupported URL'))
    expect(mainSelectorInput()).toBeUndefined()
    // That tab keeps no hidden panel of its own.
    expect(allMainSelectorInputs()).toHaveLength(1)
    await switchTo(TAB_ID)
    expect(mainSelectorInput().value).toBe('//tr')
  })
})

describe('exporting from a tab', () => {
  it('stamps each export with the time it was made, not when the tab was first shown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    await attachToTab(PAGE_URL, {
      currentScrapeConfig: config,
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })
    // The menu stays open until the background replies.
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ success: true, url: 'https://docs.google.com/x' })
        return Promise.resolve(undefined)
      },
    )
    view = await render()
    const exportToSheets = async () => {
      const trigger = [...view.container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Export',
      )!
      fireEvent.pointerDown(trigger, { button: 0 })
      fireEvent.pointerUp(trigger, { button: 0 })
      fireEvent.click(trigger)
      fireEvent.click(await screen.findByRole('menuitem', { name: /Google Sheets/ }))
    }
    const exportedFilenames = () =>
      sendMessage.mock.calls
        .map(([message]) => message as Message<{ filename: string }>)
        .filter((message) => message.type === MESSAGE_TYPES.EXPORT_TO_SHEETS)
        .map((message) => message.payload!.filename)

    await waitFor(() => expect(view.container.textContent).toContain('Extracted Data'))
    await exportToSheets()
    vi.setSystemTime(new Date('2026-01-01T14:00:00Z'))
    await exportToSheets()

    expect(exportedFilenames()).toEqual([
      'Data export for httpsexamplecomtable at 2026-01-01_10-00-00-000',
      'Data export for httpsexamplecomtable at 2026-01-01_14-00-00-000',
    ])
    vi.useRealTimers()
  })
})
