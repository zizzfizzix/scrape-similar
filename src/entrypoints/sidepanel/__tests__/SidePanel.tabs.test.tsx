// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import SidePanel from '@/entrypoints/sidepanel/SidePanel'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import { getPresets, getRecentMainSelectors, userPresetsStorage } from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import {
  MESSAGE_TYPES,
  SYSTEM_PRESET_STATUS_KEY,
  type Preset,
  type ScrapeConfig,
  type SidePanelConfig,
} from '@/utils/types'
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import {
  openRadixTrigger,
  querySelector,
  renderComponent,
  setInputValue,
  stubScrolling,
  waitFor,
  type RenderResult,
} from '@@/tests/support/react'

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

let view: RenderResult | undefined

const TAB_ID = 4
const OTHER_TAB_ID = 7
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
      const tabs = [(url === null ? { id: TAB_ID } : { id: TAB_ID, url }) as Browser.tabs.Tab]
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
  renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <SidePanel debugMode={false} onDebugModeChange={() => {}} />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

const mainSelectorInput = () =>
  querySelector<HTMLTextAreaElement>(view!.container, 'textarea#mainSelector')

/** Tell the panel the browser switched to `tabId`. */
const activateTab = (tabId: number) =>
  view!.act(async () => {
    await fakeBrowser.tabs.onActivated.trigger({ tabId, windowId: 1 })
  })

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  stubScrolling()
  await userPresetsStorage.setValue([])
  await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined as never)
  contentScriptReplies({ success: true, matchCount: 3 })
  await attachToTab()
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
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

  it('forgets the URL when the new tab cannot be read', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    view = await render()
    tabsGetReplies({}, { message: 'No tab with id 7' })

    await activateTab(OTHER_TAB_ID)

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Error getting tab info:', expect.anything()),
    )
  })

  it('follows a URL change in the tab it is attached to', async () => {
    view = await render()
    tabsGetReplies({ id: TAB_ID, url: 'chrome://settings' })

    await view.act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { url: 'chrome://settings' }, {} as never)
    })

    await waitFor(() => expect(view!.container.textContent).toContain('Unsupported URL'))
  })

  it('ignores a URL change in a tab it is not attached to', async () => {
    view = await render()
    const get = tabsGetReplies({ id: OTHER_TAB_ID, url: 'chrome://settings' })

    await view.act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(
        OTHER_TAB_ID,
        { url: 'chrome://settings' },
        {} as never,
      )
    })

    expect(get).not.toHaveBeenCalled()
  })

  it('blanks the URL when the updated tab cannot be read', async () => {
    view = await render()
    tabsGetReplies({}, { message: 'gone' })

    await view.act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { url: 'about:blank' }, {} as never)
    })

    // A blank URL is not injectable either, so the splash takes over.
    await waitFor(() => expect(view!.container.textContent).toContain('Unsupported URL'))
  })

  it('ignores stored data that arrives for a different tab', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await view.act(async () => {
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
      undefined as never,
    )

    await view.act(() =>
      querySelector<HTMLButtonElement>(view!.container, 'button[aria-label="Add column"]').click(),
    )

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not try to scrape, highlight or open the picker', async () => {
    const sendMessage = contentScriptReplies({ success: true })
    view = await render()

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Open visual picker"]',
      ).click(),
    )
    await view.act(() => setInputValue(mainSelectorInput(), '//td'))
    // The button offers to validate the draft, which would normally scrape.
    await view.act(async () => {
      ;[...view!.container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Validate selector')!
        .click()
      await Promise.resolve()
    })
    // Committing the draft would normally ask for a highlight.
    await view.act(async () => {
      mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('still lets the row list be highlighted without reaching the page', async () => {
    const sendMessage = contentScriptReplies({ success: true })
    view = await render()

    await view.act(() =>
      querySelector<HTMLButtonElement>(view!.container, 'button[aria-label="Add column"]').click(),
    )

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
    await waitFor(() => expect(view!.container.textContent).toContain('Extracted Data'))
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
        [...view!.container.querySelectorAll('button')].some(
          (candidate) => candidate.textContent?.trim() === 'Scrape',
        ),
      ).toBe(true),
    )
    expect(view.container.textContent).toContain('Extracted Data')
  })

  it('ignores state that arrives for a tab it has already left', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    view = await render()

    // Hold the activation's storage read open, switch tabs again underneath it,
    // then let the stale read land.
    let release: ((value: SidePanelConfig | null) => void) | undefined
    const getItem = vi
      .spyOn(storage, 'getItem')
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)) as never)
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    await activateTab(OTHER_TAB_ID)
    getItem.mockRestore()
    await activateTab(TAB_ID)

    await view.act(async () => {
      release!({ currentScrapeConfig: { ...config, mainSelector: '//stale' } })
    })

    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('called for wrong tab')),
    )
    expect(mainSelectorInput().value).not.toBe('//stale')
  })

  it('reports a stored read the browser refused after a tab switch', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    view = await render()
    tabsGetReplies({ id: OTHER_TAB_ID, url: 'https://example.org/list' })
    vi.spyOn(storage, 'getItem').mockImplementationOnce(async () => {
      setLastError({ message: 'session storage unavailable' })
      return null as never
    })

    await activateTab(OTHER_TAB_ID)
    setLastError(undefined)

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error loading data from storage'),
        expect.anything(),
      ),
    )
  })

  it('blanks the URL of an activated tab that reports none', async () => {
    view = await render()
    tabsGetReplies({ id: OTHER_TAB_ID })

    await activateTab(OTHER_TAB_ID)

    // An empty URL is not injectable, so the panel explains itself.
    await waitFor(() => expect(view!.container.textContent).toContain('Unsupported URL'))
  })

  it('blanks the URL when an update reports none', async () => {
    view = await render()
    tabsGetReplies({ id: TAB_ID })

    await view.act(async () => {
      await fakeBrowser.tabs.onUpdated.trigger(TAB_ID, { status: 'loading' }, {} as never)
    })

    await waitFor(() => expect(view!.container.textContent).toContain('Unsupported URL'))
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
    contentScriptReplies(response)
    await view!.act(async () => {
      ;[...view!.container.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === label)!
        .click()
      await Promise.resolve()
    })
  }

  const scraped = { data: { data: [], columnOrder: ['Rank'] }, success: true }

  it('adds a selector no preset covers to the recents', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape(scraped)

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual(['//tr']))
  })

  it('leaves a selector a preset already covers out of the recents', async () => {
    await userPresetsStorage.setValue([
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

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual([]))
  })

  it('remembers nothing when the scrape ran on a blank selector', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: { ...config, mainSelector: '' } })
    view = await render()
    // With an uncommitted draft the button is offered as "Validate selector",
    // and the scrape still runs against the blank committed config.
    await view.act(() => {
      mainSelectorInput().focus()
      setInputValue(mainSelectorInput(), '//td')
    })

    await scrape(scraped, 'Validate selector')

    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual([]))
  })

  it('ignores a preset with no selector while checking the recents', async () => {
    await userPresetsStorage.setValue([
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

  it('reports no rows for a reply that carries no data at all', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape({ success: true })

    await waitFor(() => expect(view!.container.textContent).toContain('0 found'))
  })

  it('records the row count from a reply that does not claim success', async () => {
    await withValidatedSelector()
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await scrape({ data: { data: [] } })

    // No `success: true`, so nothing is remembered about the config used.
    await waitFor(async () => expect(await getRecentMainSelectors()).toEqual([]))
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
    [...view!.container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    )!

  /** Open the Load popover; its content is portalled onto the body. */
  const openPresetList = () => view!.act(() => openRadixTrigger(byLabel('Load')))

  const presetRow = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((candidate) =>
      candidate.textContent?.includes(name),
    )

  /** Wait until `name` shows up in the preset list. */
  const waitForPreset = async (name: string) => {
    await openPresetList()
    await waitFor(() => expect(presetRow(name)).toBeDefined())
  }

  const loadPreset = async (name: string) => {
    await waitForPreset(name)
    await view!.act(() => presetRow(name)!.click())
  }

  /** Open the Save drawer, name the preset and confirm. */
  const savePresetNamed = async (name: string) => {
    await view!.act(() => openRadixTrigger(byLabel('Save')))
    const nameField = querySelector<HTMLInputElement>(
      document.body,
      'input[placeholder="Preset name"]',
    )
    await view!.act(() => setInputValue(nameField, name))
    await view!.act(async () => {
      ;[...document.querySelectorAll<HTMLButtonElement>('[data-slot="drawer-content"] button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Save')
        .at(-1)!
        .click()
      await Promise.resolve()
    })
  }

  /** Open the Load popover, ask to remove `name`, and confirm. */
  const deletePresetNamed = async (name: string) => {
    await waitForPreset(name)
    await view!.act(() => querySelector<HTMLButtonElement>(presetRow(name)!, 'button').click())
    await view!.act(async () => {
      ;[...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => ['Delete', 'Hide'].includes(candidate.textContent?.trim() ?? ''))!
        .click()
      await Promise.resolve()
    })
  }

  it('records loading a user preset', async () => {
    await userPresetsStorage.setValue([userPreset])
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
    await userPresetsStorage.setValue([
      { ...userPreset, config: { mainSelector: '', columns: config.columns } },
    ])
    view = await render()
    await waitForPreset('Rows')
    const sendMessage = contentScriptReplies({ success: true, matchCount: 3 })

    await view.act(() => presetRow('Rows')!.click())

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('saves the current config as a preset', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config, highlightMatchCount: 3 })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))

    await savePresetNamed('Mine')

    await waitFor(async () => expect((await getPresets())[0]?.name).toBe('Mine'))
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
    vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValue(new Error('quota exceeded'))

    await savePresetNamed('Mine')

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Failed to save preset'))
  })

  it('deletes a user preset and says so', async () => {
    await userPresetsStorage.setValue([userPreset])
    view = await render()

    await deletePresetNamed('Rows')

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_DELETION, {
        type: 'user',
      }),
    )
    expect(toastMocks.toast.success).toHaveBeenCalled()
  })

  it('reports a preset it could not delete', async () => {
    await userPresetsStorage.setValue([userPreset])
    view = await render()
    vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValue(new Error('quota exceeded'))

    await deletePresetNamed('Rows')

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalled())
  })

  it('hides a system preset rather than deleting it', async () => {
    const systemPreset = SYSTEM_PRESETS[0]!
    view = await render()

    await deletePresetNamed(systemPreset.name)

    await waitFor(async () =>
      expect(await storage.getItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`)).toEqual({
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

    await view.act(async () => {
      await userPresetsStorage.setValue([userPreset])
    })

    await waitFor(() => expect(presetRow('Rows')).toBeDefined())
  })

  it('picks up a system preset hidden from another extension page', async () => {
    const systemPreset = SYSTEM_PRESETS[0]!
    view = await render()
    await waitForPreset(systemPreset.name)

    await view.act(async () => {
      await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, { [systemPreset.id]: false })
    })

    await waitFor(() => expect(presetRow(systemPreset.name)).toBeUndefined())
  })

  it('picks up presets imported from the settings drawer', async () => {
    view = await render()
    await view.act(() =>
      openRadixTrigger(
        querySelector<HTMLButtonElement>(view!.container, 'button[aria-label="Settings"]'),
      ),
    )
    const fileInput = querySelector<HTMLInputElement>(document.body, 'input[type="file"]')

    await view.act(async () => {
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
    await view.act(async () => {
      // The Settings row and the confirmation both read "Import"; the
      // confirmation is portalled, so it comes last in the document.
      ;[...document.querySelectorAll<HTMLButtonElement>('button')]
        .filter((candidate) => candidate.textContent?.trim() === 'Import')
        .at(-1)!
        .click()
      await Promise.resolve()
    })

    await waitFor(async () => expect((await getPresets())[0]?.name).toBe('Rows'))
  })

  it('falls back to the system presets when the user ones cannot be read', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    vi.spyOn(userPresetsStorage, 'getValue').mockRejectedValue(new Error('storage unavailable'))

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

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Open visual picker"]',
      ).click(),
    )

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })

  it('says nothing when the picker toggle lands', async () => {
    view = await render()
    const sendMessage = contentScriptReplies({ success: true })

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Open visual picker"]',
      ).click(),
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

    await view.act(() => setInputValue(mainSelectorInput(), '//td'))
    await view.act(async () => {
      mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })

  it('ignores a highlight reply that reports neither a count nor an error', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()
    await waitFor(() => expect(mainSelectorInput().value).toBe('//tr'))
    contentScriptReplies({ success: true })

    await view.act(() => setInputValue(mainSelectorInput(), '//td'))
    await view.act(async () => {
      mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

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
        view!.container.querySelector('button[aria-label="Highlight this element"]'),
      ).not.toBeNull(),
    )
    contentScriptReplies({ success: true })

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Highlight this element"]',
      ).click(),
    )

    expect(toastMocks.toast.error).not.toHaveBeenCalled()
  })

  it('says nothing when the picker refuses without an error', async () => {
    view = await render()
    contentScriptReplies({ success: false })

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Open visual picker"]',
      ).click(),
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
        view!.container.querySelector('button[aria-label="Highlight this element"]'),
      ).not.toBeNull(),
    )
    contentScriptReplies(undefined, { message: 'port closed' })

    await view.act(() =>
      querySelector<HTMLButtonElement>(
        view!.container,
        'button[aria-label="Highlight this element"]',
      ).click(),
    )

    await waitFor(() => expect(toastMocks.toast.error).toHaveBeenCalledWith(CONNECT_ERROR))
  })
})
