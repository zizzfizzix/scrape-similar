// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidePanel } from '@/entrypoints/sidepanel/SidePanel'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import { getPresets, userPresetsStorage } from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import {
  MESSAGE_TYPES,
  SYSTEM_PRESET_STATUS_KEY,
  type ScrapeConfig,
  type ScrapedRow,
  type SidePanelConfig,
} from '@/utils/types'
import { chromeExtensionId } from '@@/package.json' with { type: 'json' }
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import {
  type RenderResult,
  act,
  fireEvent,
  render as renderComponent,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

const TAB_ID = 4
const PAGE_URL = 'https://example.com/table'

/** Pretend the panel is attached to `url`, with `state` already stored for it. */
const attachToTab = async (url = PAGE_URL, state?: SidePanelConfig) => {
  spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
    (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
      const tabs = [{ id: TAB_ID, url } as Browser.tabs.Tab]
      callback?.(tabs)
      return Promise.resolve(tabs)
    },
  )
  if (state) await storage.setItem(`session:sidepanel_config_${TAB_ID}`, state)
}

/** Reply to every content-script message with `response`. */
const contentScriptReplies = (response: unknown, lastError?: { message?: string }) =>
  spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
    (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
      setLastError(lastError)
      callback?.(response)
      setLastError(undefined)
      return Promise.resolve(response)
    },
  )

/** Render, and let mount-time storage reads settle before asserting. */
const render = async (props: Partial<Parameters<typeof SidePanel>[0]> = {}) => {
  const rendered = renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <SidePanel debugMode={false} onDebugModeChange={() => {}} {...props} />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )
  await act(async () => {})
  return rendered
}

const mainSelectorInput = () =>
  view.container.querySelector<HTMLTextAreaElement>('textarea#mainSelector')!
const byText = (text: string): HTMLButtonElement => {
  const found = [...view.container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!found) throw new Error(`No button labelled "${text}"`)
  return found
}

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  await userPresetsStorage.setValue([])
  // The panel is behind the consent gate.
  await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined as never)
  contentScriptReplies({ success: true, matchCount: 3 })
  await attachToTab()
})

describe('SidePanel', () => {
  it('shows the config form for a scrapable page', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Configuration')
    expect(view.container.textContent).toContain('Main Selector')
  })

  it('shows the footer with settings', async () => {
    view = await render()

    expect(view.container.querySelector('button[aria-label="Settings"]')).toBeTruthy()
  })

  it('restores the stored config for the tab', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })

    view = await render()

    expect(mainSelectorInput().value).toBe('//tr')
  })

  it('seeds the selector from a right-clicked element when nothing is stored', async () => {
    await attachToTab(PAGE_URL, {
      elementDetails: { xpath: '/html/body/ul/li', text: 'first' },
    })

    view = await render()

    expect(mainSelectorInput().value).toBe('/html/body/ul/li')
  })

  it('starts blank for a tab with no stored state', async () => {
    view = await render()

    expect(mainSelectorInput().value).toBe('')
  })

  describe('unsupported pages', () => {
    it('explains why it cannot work on a browser page', async () => {
      await attachToTab('chrome://settings')

      view = await render()

      expect(view.container.textContent).toContain('Unsupported URL')
      expect(view.container.textContent).toContain('chrome://')
    })

    it('still offers the settings drawer there', async () => {
      await attachToTab('chrome://settings')

      view = await render()

      expect(view.container.querySelector('button[aria-label="Settings"]')).toBeTruthy()
    })

    it('offers a way back when the tab is the full data view', async () => {
      await attachToTab(`chrome-extension://${chromeExtensionId}/full-data-view.html?tabId=9`)

      view = await render()

      expect(view.container.textContent).toContain('Full Screen View Active')
      expect(byText('Compact View')).toBeTruthy()
    })
  })

  describe('going back from the full data view', () => {
    const attachToFullDataView = (search = '?tabId=9') =>
      attachToTab(`chrome-extension://${chromeExtensionId}/full-data-view.html${search}`)

    it('switches to the original tab and closes the view', async () => {
      await attachToFullDataView()
      const get = spyOnBrowser(fakeBrowser.tabs, 'get').mockResolvedValue({} as never)
      const update = spyOnBrowser(fakeBrowser.tabs, 'update').mockResolvedValue({} as never)
      const remove = spyOnBrowser(fakeBrowser.tabs, 'remove').mockResolvedValue(undefined as never)
      view = await render()

      await act(async () => {
        byText('Compact View').click()
        await Promise.resolve()
      })

      expect(get).toHaveBeenCalledWith(9)
      expect(update).toHaveBeenCalledWith(9, { active: true })
      expect(remove).toHaveBeenCalledWith(TAB_ID)
    })

    it('reports an original tab that has since closed', async () => {
      await attachToFullDataView()
      spyOnBrowser(fakeBrowser.tabs, 'get').mockRejectedValue(new Error('No tab with id 9'))
      view = await render()

      await act(async () => {
        byText('Compact View').click()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Target tab does not exist')
    })

    it('reports a view URL that names no tab', async () => {
      await attachToFullDataView('')
      view = await render()

      await act(async () => {
        byText('Compact View').click()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('No target tab ID found')
    })

    it('closes the panel when asked to hide it', async () => {
      await attachToFullDataView()
      const close = vi.spyOn(window, 'close').mockImplementation(() => {})
      view = await render()

      await userEvent.click(byText('Hide Sidepanel'))

      expect(close).toHaveBeenCalled()
    })
  })

  describe('scraping', () => {
    const withValidatedSelector = () =>
      attachToTab(PAGE_URL, { currentScrapeConfig: config, highlightMatchCount: 3 })

    it('asks the content script to scrape', async () => {
      await withValidatedSelector()
      const sendMessage = contentScriptReplies({
        success: true,
        data: { data: [row({ Rank: '1' })], columnOrder: ['Rank'] },
      })
      view = await render()

      await act(async () => {
        byText('Scrape').click()
        await Promise.resolve()
      })

      expect(sendMessage).toHaveBeenCalledWith(
        TAB_ID,
        { type: MESSAGE_TYPES.START_SCRAPE, payload: config },
        expect.any(Function),
      )
    })

    it('shows the results once they arrive', async () => {
      await attachToTab(PAGE_URL, {
        currentScrapeConfig: config,
        highlightMatchCount: 3,
        scrapeResult: { data: [row({ Rank: '1' })], columnOrder: ['Rank'] },
      })

      view = await render()

      expect(view.container.textContent).toContain('Extracted Data')
      expect(view.container.textContent).toContain('Export')
    })

    it('reports a content script it cannot reach', async () => {
      await withValidatedSelector()
      contentScriptReplies(undefined, { message: 'Receiving end does not exist' })
      view = await render()

      await act(async () => {
        byText('Scrape').click()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not connect to the content script'),
      )
    })

    it('reports an error the content script returned', async () => {
      await withValidatedSelector()
      contentScriptReplies({ error: 'Invalid XPath' })
      view = await render()

      await act(async () => {
        byText('Scrape').click()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Invalid XPath')
    })
  })

  describe('highlighting', () => {
    it('records a successful match count', async () => {
      const sendMessage = contentScriptReplies({ success: true, matchCount: 7 })
      const runtimeSend = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
        undefined as never,
      )
      view = await render()

      fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
      await act(async () => {
        mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      expect(sendMessage).toHaveBeenCalledWith(
        TAB_ID,
        { type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//li' } },
        expect.any(Function),
      )
      expect(runtimeSend).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: {
          tabId: TAB_ID,
          updates: { highlightMatchCount: 7, highlightError: null },
        },
      })
    })

    it('records a selector the content script rejected', async () => {
      contentScriptReplies({ success: false, error: 'Invalid XPath' })
      const runtimeSend = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
        undefined as never,
      )
      view = await render()

      fireEvent.change(mainSelectorInput(), { target: { value: '//[[' } })
      await act(async () => {
        mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      expect(runtimeSend).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: {
          tabId: TAB_ID,
          updates: { highlightMatchCount: null, highlightError: 'Invalid XPath' },
        },
      })
    })
  })

  describe('presets', () => {
    /** The Load combobox is a Radix popover, portalled to the body. */
    const openPresetList = () => userEvent.click(byText('Load'))

    it('loads the presets on mount', async () => {
      view = await render()

      await openPresetList()

      expect(document.body.textContent).toContain(SYSTEM_PRESETS[0]!.name)
    })

    it('hides a system preset rather than deleting it', async () => {
      view = await render()
      await openPresetList()

      const hideButton = [...document.querySelectorAll('button')].find((candidate) =>
        candidate.getAttribute('aria-label')?.startsWith('Hide preset'),
      )
      await act(async () => {
        hideButton!.click()
        await Promise.resolve()
      })
      const confirm = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent === 'Hide',
      )
      await act(async () => {
        confirm!.click()
        await Promise.resolve()
      })

      const status = await storage.getItem<Record<string, boolean>>(
        `sync:${SYSTEM_PRESET_STATUS_KEY}`,
      )
      expect(Object.values(status ?? {})).toContain(false)
      expect(trackEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.PRESET_HIDE,
        expect.objectContaining({ type: 'system' }),
      )
    })

    it('re-enables the system presets when they are reset', async () => {
      await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, {
        [SYSTEM_PRESETS[0]!.id]: false,
      })
      view = await render()

      await userEvent.click(
        view.container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!,
      )

      // The drawer locks pointer events on the body while it is open, which
      // user-event refuses to click through, so dispatch the click directly.
      const resetButton = await waitFor(() => {
        const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (candidate) => candidate.textContent === 'Reset',
        )
        if (!found) throw new Error('No Reset button rendered')
        return found
      })
      fireEvent.click(resetButton)

      // The side panel clears every disable rather than removing the map.
      await waitFor(async () =>
        expect(await storage.getItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`)).toEqual({}),
      )
      expect(toastMocks.toast.success).toHaveBeenCalledWith('System presets have been reset')
    })
  })

  it('keeps its own state per tab', async () => {
    await attachToTab(PAGE_URL, { currentScrapeConfig: config })
    view = await render()

    expect(mainSelectorInput().value).toBe('//tr')
    expect(await getPresets()).toEqual([])
  })
})
