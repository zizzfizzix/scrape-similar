// @vitest-environment jsdom
import ConfigForm from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { setRecentMainSelectors, userPresetsStorage } from '@/utils/storage'
import { SYSTEM_PRESET_STATUS_KEY, type Preset, type ScrapeConfig } from '@/utils/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import {
  querySelector,
  renderComponent,
  setInputValue,
  type RenderResult,
} from '@@/tests/support/react'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => toastMocks)

let view: RenderResult | undefined

const preset = (id: string, name: string, mainSelector: string): Preset => ({
  id,
  name,
  config: { mainSelector, columns: [{ name: 'Text', selector: '.' }] },
  createdAt: 1_700_000_000_000,
})

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [
    { name: 'Rank', selector: './td[1]' },
    { name: 'Country', selector: './td[2]' },
  ],
}

type ConfigFormProps = Parameters<typeof ConfigForm>[0]

const baseProps = (): ConfigFormProps => ({
  config,
  onChange: () => {},
  onScrape: () => {},
  onHighlight: () => {},
  onPickerMode: () => {},
  isLoading: false,
  initialOptions: null,
  presets: [],
  onLoadPreset: () => {},
  onSavePreset: () => {},
  onDeletePreset: () => {},
  showPresets: false,
  setShowPresets: () => {},
  lastScrapeRowCount: null,
  // A validated selector, so the scrape and save actions are enabled by default.
  highlightMatchCount: 3,
})

const render = (overrides: Partial<ConfigFormProps> = {}) =>
  renderComponent(
    <TooltipProvider>
      <ConfigForm {...baseProps()} {...overrides} />
    </TooltipProvider>,
  )

const mainSelectorInput = () =>
  querySelector<HTMLTextAreaElement>(view!.container, 'textarea#mainSelector')
const columnNameInputs = () => [
  ...view!.container.querySelectorAll<HTMLInputElement>('input[placeholder="Column name"]'),
]
const columnSelectorInputs = () => [
  ...view!.container.querySelectorAll<HTMLInputElement>('input[placeholder="Selector"]'),
]
const button = (label: string) =>
  querySelector<HTMLButtonElement>(view!.container, `button[aria-label="${label}"]`)
const allButtons = (label: string) => [
  ...view!.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
]
const byText = (text: string): HTMLButtonElement => {
  const found = [...view!.container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  if (!found) throw new Error(`No button labelled "${text}"`)
  return found
}

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  await userPresetsStorage.setValue([])
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('ConfigForm', () => {
  it('shows the configuration sections', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Configuration')
    expect(view.container.textContent).toContain('Main Selector')
    expect(view.container.textContent).toContain('Columns')
  })

  it('shows the current main selector', async () => {
    view = await render()

    expect(mainSelectorInput().value).toBe('//tr')
  })

  it('shows one row per configured column', async () => {
    view = await render()

    expect(columnNameInputs().map((input) => input.value)).toEqual(['Rank', 'Country'])
    expect(columnSelectorInputs().map((input) => input.value)).toEqual(['./td[1]', './td[2]'])
  })

  describe('the main selector', () => {
    it('does not report a change until the field is left', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await view.act(() => setInputValue(mainSelectorInput(), '//li'))

      expect(onChange).not.toHaveBeenCalled()
      expect(mainSelectorInput().value).toBe('//li')
    })

    it('collapses pasted line breaks into spaces', async () => {
      view = await render()

      await view.act(() => setInputValue(mainSelectorInput(), '//table\n//tr'))

      expect(mainSelectorInput().value).toBe('//table //tr')
    })

    it('commits the change and asks for a highlight on blur', async () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ onChange, onHighlight })

      await view.act(() => setInputValue(mainSelectorInput(), '//li'))
      await view.act(() => {
        // React delivers onBlur from the bubbling focusout event.
        mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        vi.advanceTimersByTime(200)
      })

      expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//li' })
      expect(onHighlight).toHaveBeenCalledWith('//li')
      vi.useRealTimers()
    })

    it('does not ask for a highlight when the selector is cleared', async () => {
      vi.useFakeTimers()
      const onHighlight = vi.fn()
      view = await render({ onHighlight })

      await view.act(() => setInputValue(mainSelectorInput(), '   '))
      await view.act(() => {
        // React delivers onBlur from the bubbling focusout event.
        mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        vi.advanceTimersByTime(200)
      })

      expect(onHighlight).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('follows a selector changed by its parent', async () => {
      view = await render()

      await view.render(
        <TooltipProvider>
          <ConfigForm {...baseProps()} config={{ ...config, mainSelector: '//section' }} />
        </TooltipProvider>,
      )

      expect(mainSelectorInput().value).toBe('//section')
    })
  })

  describe('columns', () => {
    it('reports a renamed column', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await view.act(() => setInputValue(columnNameInputs()[0]!, 'Position'))

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [{ name: 'Position', selector: './td[1]' }, config.columns[1]],
      })
    })

    it('reports a repointed column', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await view.act(() => setInputValue(columnSelectorInputs()[1]!, '@data-country'))

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [config.columns[0], { name: 'Country', selector: '@data-country' }],
      })
    })

    it('adds a numbered column', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await view.act(() => button('Add column').click())

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [...config.columns, { name: 'Column 3', selector: '.' }],
      })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ADD_COLUMN_BUTTON_PRESS)
    })

    it('removes a column and records the removal', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await view.act(() => allButtons('Remove column')[0]!.click())

      expect(onChange).toHaveBeenCalledWith({ ...config, columns: [config.columns[1]] })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.REMOVE_COLUMN_BUTTON_PRESS)
    })
  })

  describe('the scrape button', () => {
    it('scrapes when the selector is validated', async () => {
      const onScrape = vi.fn()
      view = await render({ onScrape })

      await view.act(() => byText('Scrape').click())

      expect(onScrape).toHaveBeenCalled()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS)
    })

    it('offers to validate instead while the selector is unsaved', async () => {
      view = await render()

      await view.act(() => setInputValue(mainSelectorInput(), '//li'))

      expect(byText('Validate selector')).toBeTruthy()
    })

    it('is disabled while a scrape is running', async () => {
      view = await render({ isLoading: true })

      expect(byText('Scrape').disabled).toBe(true)
    })

    it('is disabled when the config has no columns', async () => {
      view = await render({ config: { ...config, columns: [] } })

      expect(byText('Scrape').disabled).toBe(true)
    })

    it('is disabled when the selector has never been validated', async () => {
      view = await render({ highlightMatchCount: undefined })

      expect(byText('Scrape').disabled).toBe(true)
    })

    it('offers to re-scrape when the config has moved on', async () => {
      view = await render({ rescrapeAdvised: true })

      expect(byText('Scrape')).toBeTruthy()
    })

    it('reports a scrape that found nothing', async () => {
      view = await render({ lastScrapeRowCount: 0 })

      expect(byText('0 found')).toBeTruthy()
    })

    it('clears that report after a moment', async () => {
      vi.useFakeTimers()
      const onClearLastScrapeRowCount = vi.fn()
      view = await render({ lastScrapeRowCount: 0, onClearLastScrapeRowCount })

      await view.act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(byText('Scrape')).toBeTruthy()
      expect(onClearLastScrapeRowCount).toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('does not report a scrape that found rows', async () => {
      const onClearLastScrapeRowCount = vi.fn()
      view = await render({ lastScrapeRowCount: 5, onClearLastScrapeRowCount })

      expect(byText('Scrape')).toBeTruthy()
      expect(onClearLastScrapeRowCount).toHaveBeenCalled()
    })
  })

  describe('the visual picker', () => {
    it('offers to open the picker', async () => {
      const onPickerMode = vi.fn()
      view = await render({ onPickerMode })

      await view.act(() => button('Open visual picker').click())

      expect(onPickerMode).toHaveBeenCalled()
    })

    it('offers to close it while it is open', async () => {
      view = await render({ pickerModeActive: true })

      expect(button('Close visual picker')).toBeTruthy()
    })
  })

  describe('the match badge', () => {
    it('shows the number of matches', async () => {
      view = await render({ highlightMatchCount: 12 })

      expect(view.container.textContent).toContain('12')
    })

    it('warns instead when the selector was rejected', async () => {
      view = await render({ highlightMatchCount: undefined, highlightError: 'Invalid XPath' })

      // The reason itself lives in a tooltip; the badge is what is always visible.
      expect(view.container.querySelector('svg.lucide-octagon-alert')).not.toBeNull()
    })

    it('marks a selector that matched nothing', async () => {
      view = await render({ highlightMatchCount: 0 })

      const badge = querySelector(view.container, '[data-slot="badge"]')
      expect(badge.textContent).toBe('0')
    })
  })

  describe('auto-generating the config', () => {
    it('asks the content script to guess from the current selector', async () => {
      const sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
        (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
          callback?.({ success: true })
          return Promise.resolve({ success: true })
        },
      )
      spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
        (_query: unknown, callback?: (tabs: Browser.tabs.Tab[]) => void) => {
          callback?.([{ id: 4 } as Browser.tabs.Tab])
          return Promise.resolve([{ id: 4 } as Browser.tabs.Tab])
        },
      )
      view = await render()

      await view.act(async () => {
        button('Auto-generate configuration from selector').click()
        await Promise.resolve()
      })

      expect(sendMessage).toHaveBeenCalledWith(
        4,
        { type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR, payload: { mainSelector: '//tr' } },
        expect.any(Function),
      )
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTO_GENERATE_CONFIG_BUTTON_PRESS)
    })

    it('does nothing without a selector to guess from', async () => {
      const query = spyOnBrowser(fakeBrowser.tabs, 'query')
      view = await render({ config: { ...config, mainSelector: '' } })

      await view.act(() => button('Auto-generate configuration from selector').click())

      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('presets', () => {
    const presets = [preset('p1', 'Table rows', '//tr'), preset('p2', 'All links', '//a')]

    it('offers to save the current config as a preset', async () => {
      view = await render()

      expect(byText('Save')).toBeTruthy()
      expect(byText('Save').disabled).toBe(false)
    })

    it('cannot save a config with no columns', async () => {
      view = await render({ config: { ...config, columns: [] } })

      expect(byText('Save').disabled).toBe(true)
    })

    it('cannot save an unvalidated selector', async () => {
      view = await render({ highlightMatchCount: undefined })

      expect(byText('Save').disabled).toBe(true)
    })

    it('offers to load a preset', async () => {
      view = await render({ presets })

      expect(byText('Load')).toBeTruthy()
    })

    it('suggests presets and recent selectors when the field is focused', async () => {
      await setRecentMainSelectors(['//span'])
      view = await render({ presets, config: { ...config, mainSelector: '' } })

      await view.act(() => mainSelectorInput().focus())

      expect(view.container.textContent).toContain('Table rows')
      expect(view.container.textContent).toContain('//span')
    })

    it('narrows the suggestions as the user types', async () => {
      view = await render({ presets, config: { ...config, mainSelector: '' } })
      await view.act(() => mainSelectorInput().focus())

      await view.act(() => setInputValue(mainSelectorInput(), 'links'))

      expect(view.container.textContent).toContain('All links')
      expect(view.container.textContent).not.toContain('Table rows')
    })
  })

  it('respects a hidden system preset', async () => {
    await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, {})

    view = await render()

    expect(view.container.textContent).toContain('Configuration')
  })
})
