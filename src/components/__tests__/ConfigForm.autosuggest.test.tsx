// @vitest-environment jsdom
import { ConfigForm } from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS, ANALYTICS_SOURCES } from '@/utils/analytics'
import { getRecentMainSelectors, recentMainSelectorsItem, userPresetsItem } from '@/utils/storage'
import type { Preset, ScrapeConfig } from '@/utils/types'
import { outlastBlurCommit } from '@@/tests/support/blur-commit'
import { setLastError } from '@@/tests/support/fake-browser'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
import { countTrackedEvents } from '@@/tests/support/tracked-events'
import { type RenderResult, act, fireEvent, waitFor } from '@testing-library/react'
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
vi.mock('sonner', () => toastMocks)

let view: RenderResult

const preset = (id: string, name: string, mainSelector: string): Preset => ({
  id,
  name,
  config: { mainSelector, columns: [{ name: 'Text', selector: '.' }] },
  createdAt: 1_700_000_000_000,
})

const presets = [preset('p1', 'Table rows', '//tr'), preset('p2', 'All links', '//a')]

const config: ScrapeConfig = {
  mainSelector: '',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

type ConfigFormProps = Parameters<typeof ConfigForm>[0]

const baseProps = (): ConfigFormProps => ({
  tabId: 4,
  storedConfigVersion: 0,
  config,
  onChange: () => {},
  onScrape: () => {},
  onHighlight: () => {},
  onPickerMode: () => {},
  isLoading: false,
  presets: [],
  onLoadPreset: () => {},
  onSavePreset: async () => {},
  onDeletePreset: () => {},
  showPresets: false,
  setShowPresets: () => {},
  lastScrapeRowCount: null,
  highlightMatchCount: 3,
})

const render = (overrides: Partial<ConfigFormProps> = {}) =>
  renderSettled(
    <TooltipProvider>
      <ConfigForm {...baseProps()} {...overrides} />
    </TooltipProvider>,
  )

const mainSelectorInput = () =>
  view.container.querySelector<HTMLTextAreaElement>('textarea#mainSelector')!

const suggestionItems = () => [...view.container.querySelectorAll<HTMLElement>('[cmdk-item]')]

/** The id cmdk considers selected, as the dropdown reports it. */
const selectedSuggestion = () =>
  view.container.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')!

const press = (key: string, { repeat = false } = {}) =>
  act(() => {
    mainSelectorInput().dispatchEvent(
      new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }),
    )
  })

const scrapeEvents = () => countTrackedEvents(trackEvent, ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS)

/** jsdom runs frame callbacks in the order they were queued, so this one runs after the form's. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

const focusField = () => act(() => mainSelectorInput().focus())

const type = (value: string) => fireEvent.change(mainSelectorInput(), { target: { value: value } })

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  await userPresetsItem.setValue([])
  await recentMainSelectorsItem.setValue([])
})

describe('the autosuggest dropdown', () => {
  describe('opening it with an arrow key', () => {
    it('opens on ArrowDown and highlights the first entry', async () => {
      view = await render({ presets })
      // Focus opens it, so close it again to start from a shut dropdown.
      focusField()
      press('Escape')
      expect(suggestionItems()).toHaveLength(0)

      press('ArrowDown')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))
    })

    it('opens on ArrowUp and highlights the last entry', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')

      press('ArrowUp')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))
    })
  })

  describe('moving through an open dropdown', () => {
    it('walks down the list and wraps at the end', async () => {
      view = await render({ presets })
      focusField()

      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))

      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))
    })

    it('walks up the list and wraps at the start', async () => {
      view = await render({ presets })
      focusField()

      press('ArrowUp')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))
    })

    /**
     * Regression test for #270: the arrow handlers used to guard on the preset
     * list while navigating the combined one, so a dropdown showing only
     * recents swallowed the keypress and highlighted nothing.
     */
    it('navigates recents when no preset matches the query', async () => {
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets })
      focusField()
      type('//span')

      press('ArrowDown')

      await waitFor(() => {
        expect(suggestionItems()).toHaveLength(1)
        expect(selectedSuggestion()?.textContent).toContain('//span')
      })
    })

    it('navigates recents when a preset matches too', async () => {
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets })
      focusField()

      press('ArrowDown')

      await waitFor(() => {
        expect(suggestionItems()).toHaveLength(3)
        expect(selectedSuggestion()?.textContent).toContain('//span')
      })
    })

    it('does nothing when there is nothing to suggest', async () => {
      view = await render({ presets: [] })
      focusField()

      press('ArrowDown')
      press('ArrowUp')

      expect(selectedSuggestion()).toBeNull()
    })

    it('closes on Escape', async () => {
      view = await render({ presets })
      focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      press('Escape')

      expect(suggestionItems()).toHaveLength(0)
    })

    it('ignores Escape when it is already closed', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')

      press('Escape')

      expect(suggestionItems()).toHaveLength(0)
    })

    it('closes on a click outside it', async () => {
      view = await render({ presets })
      focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      act(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })

      expect(suggestionItems()).toHaveLength(0)
    })

    it('stays open for a click inside it', async () => {
      view = await render({ presets })
      focusField()

      act(() => {
        suggestionItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })

      expect(suggestionItems()).not.toHaveLength(0)
    })

    it('reopens itself while the user keeps typing', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')
      expect(suggestionItems()).toHaveLength(0)

      type('//t')

      expect(suggestionItems()).not.toHaveLength(0)
    })

    it('drops the highlight when the field is cleared', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      focusField()
      type('//tr')
      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      type('')
      press('Enter')

      // With nothing highlighted, Enter falls through to the commit path.
      expect(onLoadPreset).not.toHaveBeenCalled()
    })

    it('treats a non-list value in storage as no recents at all', async () => {
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets: [] })
      focusField()
      expect(suggestionItems()).toHaveLength(1)

      await act(async () => {
        await storage.setItem(recentMainSelectorsItem.key, 'not-a-list')
      })

      await waitFor(() => expect(suggestionItems()).toHaveLength(0))
    })

    it('keeps a recent written while the first read is still pending', async () => {
      let resolveRead!: (value: string[]) => void
      vi.spyOn(recentMainSelectorsItem, 'getValue').mockReturnValueOnce(
        new Promise((resolve) => (resolveRead = resolve)),
      )
      view = await render({ presets: [] })

      await act(async () => {
        await storage.setItem(recentMainSelectorsItem.key, ['//fresh'])
        await flushMicrotasks()
      })
      await act(async () => resolveRead([]))
      focusField()

      await waitFor(() => expect(suggestionItems()).toHaveLength(1))
      expect(suggestionItems()[0]!.textContent).toContain('//fresh')
    })
  })

  describe('choosing the highlighted entry with Enter', () => {
    it('loads a highlighted preset', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      focusField()
      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      press('Enter')

      expect(onLoadPreset).toHaveBeenCalledWith(presets[0])
      expect(mainSelectorInput().value).toBe('//tr')
      expect(suggestionItems()).toHaveLength(0)
      expect(scrapeEvents()).toBe(0)
    })

    it('applies a highlighted preset once while Enter is held', async () => {
      const onLoadPreset = vi.fn()
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets, onLoadPreset, onScrape, onHighlight })
      focusField()
      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      press('Enter')
      press('Enter', { repeat: true })

      expect(onLoadPreset).toHaveBeenCalledTimes(1)
      expect(onScrape).not.toHaveBeenCalled()
      expect(onHighlight).not.toHaveBeenCalled()
      expect(scrapeEvents()).toBe(0)
    })

    it('commits a highlighted recent selector', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets: [], onChange, onHighlight })
      focusField()
      press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('//span'))

      press('Enter')

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//span' }))
      expect(onHighlight).toHaveBeenCalledWith('//span')
      expect(scrapeEvents()).toBe(0)
    })

    it('does nothing on Enter with an empty field and no highlight', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets, onScrape, onHighlight })
      focusField()

      press('Enter')

      expect(onScrape).not.toHaveBeenCalled()
      expect(onHighlight).not.toHaveBeenCalled()
    })

    it('falls through to the scrape path when nothing is highlighted', async () => {
      const onScrape = vi.fn()
      view = await render({
        presets,
        onScrape,
        config: { ...config, mainSelector: '//tr' },
      })
      focusField()

      press('Enter')

      await waitFor(() => expect(onScrape).toHaveBeenCalled())
    })
  })

  describe('choosing an entry with the pointer', () => {
    it('loads the preset behind the row', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      focusField()

      const row = suggestionItems().find((item) => item.textContent?.includes('Table rows'))!
      act(() => {
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        row.click()
      })

      expect(onLoadPreset).toHaveBeenCalledWith(presets[0])
    })

    it('does not commit the half-typed draft when the field blurs behind the click', async () => {
      const onChange = vi.fn()
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets: [], onChange })
      focusField()
      type('//sp')

      const row = suggestionItems()[0]!
      act(() => {
        // The pointer goes down on the row before the field loses focus, which
        // is what cancels the blur handler's deferred commit.
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        mainSelectorInput().blur()
        row.click()
      })

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//span' }))
      })
      expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//sp' }))
    })
  })

  /**
   * cmdk scrolls its selection too, but only on mount and from its own
   * navigation, never from the controlled `value` prop. These tests mount it
   * with nothing selected and press keys in the textarea, so every call the
   * spy records comes from the form, and the counts can be exact.
   */
  describe('keeping the highlighted entry in view', () => {
    const spyOnScroll = () => vi.spyOn(Element.prototype, 'scrollIntoView')

    const scrolledEntries = (scroll: ReturnType<typeof spyOnScroll>) =>
      scroll.mock.contexts.map((el) => (el as HTMLElement).textContent)

    it('scrolls to the first entry when ArrowDown opens the dropdown', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')
      const scroll = spyOnScroll()

      press('ArrowDown')
      await nextFrame()

      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
      expect(scrolledEntries(scroll)).toEqual([expect.stringContaining('Table rows')])
    })

    it('scrolls to the last entry when ArrowUp opens the dropdown', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')
      const scroll = spyOnScroll()

      press('ArrowUp')
      await nextFrame()

      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
      expect(scrolledEntries(scroll)).toEqual([expect.stringContaining('All links')])
    })

    it('follows the highlight as it moves through an open dropdown', async () => {
      view = await render({ presets })
      focusField()
      const scroll = spyOnScroll()

      press('ArrowDown')
      await nextFrame()
      press('ArrowDown')
      await nextFrame()
      press('ArrowUp')
      await nextFrame()

      expect(scrolledEntries(scroll)).toEqual([
        expect.stringContaining('Table rows'),
        expect.stringContaining('All links'),
        expect.stringContaining('Table rows'),
      ])
      expect(scroll.mock.calls).toEqual(Array(3).fill([{ block: 'nearest' }]))
    })

    it('scrolls nothing when the dropdown opens with nothing to suggest', async () => {
      view = await render({ presets: [] })
      focusField()
      press('Escape')
      const scroll = spyOnScroll()

      press('ArrowDown')
      await nextFrame()

      expect(view.container.textContent).toContain('No suggestions found')
      expect(scroll).not.toHaveBeenCalled()
    })

    it('scrolls nothing when the dropdown closes before the frame runs', async () => {
      view = await render({ presets })
      focusField()
      press('Escape')
      const scroll = spyOnScroll()
      // Holding the frames back lets the test run the queued frame after Escape
      // instead of waiting for jsdom to run it.
      const heldFrames: FrameRequestCallback[] = []
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        heldFrames.push(callback)
        return heldFrames.length
      })

      press('ArrowDown')
      press('Escape')
      expect(heldFrames).not.toHaveLength(0)
      act(() => heldFrames.forEach((callback) => callback(performance.now())))

      expect(suggestionItems()).toHaveLength(0)
      expect(scroll).not.toHaveBeenCalled()
    })
  })

  describe('leaving the field', () => {
    it('commits the draft once the deferred blur runs', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      focusField()
      type('//h2')

      act(() => mainSelectorInput().blur())
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//h2' })),
      )
    })

    it('commits the draft without its surrounding whitespace', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      focusField()
      type('  //h2 ')

      act(() => mainSelectorInput().blur())
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h2' }),
      )
      expect(mainSelectorInput().value).toBe('//h2')
    })

    it('keeps the dropdown open when focus moves into it', async () => {
      const onChange = vi.fn()
      view = await render({ presets, onChange })
      focusField()
      type('//t')

      act(() => {
        // cmdk's root carries tabIndex={-1} so it can take focus this way.
        view.container.querySelector<HTMLElement>('[cmdk-root]')!.focus()
        mainSelectorInput().blur()
      })
      await outlastBlurCommit()
      await settleEffects()

      expect(suggestionItems()).not.toHaveLength(0)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not commit when the pointer went down on a suggestion', async () => {
      const onChange = vi.fn()
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets: [], onChange })
      focusField()
      type('//sp')

      act(() => {
        // Pointer down on the row, then the field loses focus — but the click
        // never lands (the pointer moved away before it was released).
        suggestionItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        mainSelectorInput().blur()
      })
      await outlastBlurCommit()
      await settleEffects()

      expect(onChange).not.toHaveBeenCalled()
    })

    it('cancels a pending blur when focus comes straight back', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      focusField()
      type('//h2')

      act(() => mainSelectorInput().blur())
      focusField()
      await outlastBlurCommit()
      await settleEffects()

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('forgetting a recent selector', () => {
    it('offers to delete a suggested preset and closes the dropdown', async () => {
      const onDeletePreset = vi.fn()
      view = await render({ presets, onDeletePreset })
      focusField()

      const row = suggestionItems().find((item) => item.textContent?.includes('All links'))!
      act(() => row.querySelector<HTMLButtonElement>('button')!.click())

      expect(suggestionItems()).toHaveLength(0)
      expect(document.body.textContent).toContain('Delete Preset')
    })

    it('drops it from storage and keeps the dropdown open', async () => {
      await recentMainSelectorsItem.setValue(['//span', '//em'])
      view = await render({ presets: [] })
      focusField()
      expect(suggestionItems()).toHaveLength(2)

      const remove = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove recent selector"]',
      )!
      await userEvent.click(remove)

      await waitFor(async () => {
        expect(await getRecentMainSelectors()).toEqual(['//em'])
        expect(suggestionItems()).toHaveLength(1)
      })
    })
  })

  describe('typing a selector and pressing Enter', () => {
    it('writes no recents itself on Enter', async () => {
      view = await render({ presets: [], config: { ...config, mainSelector: '//tr' } })
      focusField()
      type('//h1')
      press('Enter')
      focusField()
      type('//tr')
      press('Enter')
      await flushMicrotasks()

      expect(await getRecentMainSelectors()).toEqual([])
    })

    it('validates instead of scraping while the selector is unvalidated', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onHighlight,
        config: { ...config, mainSelector: '//h1' },
        highlightMatchCount: undefined,
      })
      focusField()

      press('Enter')

      await waitFor(() => expect(onHighlight).toHaveBeenCalledWith('//h1'))
      expect(onScrape).not.toHaveBeenCalled()
      expect(scrapeEvents()).toBe(0)
    })

    describe('while an IME is composing', () => {
      it.each([
        ['the event reports the composition', { isComposing: true }],
        ['Safari reports it only through keyCode 229', { keyCode: 229 }],
      ])('leaves Enter to the IME when %s', async (_, composition) => {
        const onChange = vi.fn()
        const onScrape = vi.fn()
        const onHighlight = vi.fn()
        view = await render({ presets: [], onChange, onScrape, onHighlight })
        focusField()
        type('//h1')

        const wasNotCancelled = fireEvent.keyDown(mainSelectorInput(), {
          key: 'Enter',
          ...composition,
        })
        await act(flushMicrotasks)

        expect(wasNotCancelled).toBe(true)
        expect(onChange).not.toHaveBeenCalled()
        expect(onScrape).not.toHaveBeenCalled()
        expect(onHighlight).not.toHaveBeenCalled()
        expect(mainSelectorInput()).toHaveFocus()
        expect(await getRecentMainSelectors()).toEqual([])
      })

      it('leaves the arrow keys to the IME', async () => {
        view = await render({ presets })
        focusField()
        press('Escape')

        const wasNotCancelled = fireEvent.keyDown(mainSelectorInput(), {
          key: 'ArrowDown',
          isComposing: true,
        })
        await nextFrame()

        expect(wasNotCancelled).toBe(true)
        expect(suggestionItems()).toHaveLength(0)
      })
    })

    it('commits an edited selector on the keypress and leaves the field', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets: [], onChange, onHighlight })
      focusField()
      type('//h1')

      press('Enter')

      expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h1' })
      expect(onHighlight).toHaveBeenCalledWith('//h1')
      expect(mainSelectorInput()).not.toHaveFocus()
      expect(suggestionItems()).toHaveLength(0)
    })

    it('commits once, not again when the blur it causes falls due', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets: [], onChange, onHighlight })
      focusField()
      type('//h1')

      press('Enter')
      await outlastBlurCommit()

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onHighlight).toHaveBeenCalledTimes(1)
    })

    it('commits the selector without its surrounding whitespace', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      focusField()
      type('  //h1  ')

      press('Enter')

      expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h1' })
    })

    it('scrapes an unchanged, validated selector on the keypress', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onHighlight,
        config: { ...config, mainSelector: '//tr' },
      })
      focusField()

      press('Enter')

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(onHighlight).not.toHaveBeenCalled()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS, {
        source: ANALYTICS_SOURCES.ENTER_KEY,
      })
      expect(scrapeEvents()).toBe(1)
    })

    it('ignores the repeats of a held Enter key', async () => {
      const onScrape = vi.fn()
      view = await render({ presets: [], onScrape, config: { ...config, mainSelector: '//tr' } })
      focusField()

      press('Enter')
      press('Enter', { repeat: true })
      press('Enter', { repeat: true })

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(scrapeEvents()).toBe(1)
    })

    it('does not scrape while a scrape is already running', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onHighlight,
        isLoading: true,
        config: { ...config, mainSelector: '//tr' },
      })
      focusField()

      press('Enter')

      expect(onScrape).not.toHaveBeenCalled()
      expect(scrapeEvents()).toBe(0)
      expect(onHighlight).not.toHaveBeenCalled()
      expect(mainSelectorInput()).toHaveFocus()
    })

    it('does not scrape a config without columns', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onHighlight,
        config: { mainSelector: '//tr', columns: [] },
      })
      focusField()

      press('Enter')

      expect(onScrape).not.toHaveBeenCalled()
      expect(scrapeEvents()).toBe(0)
      expect(onHighlight).not.toHaveBeenCalled()
      expect(mainSelectorInput()).toHaveFocus()
    })

    it('keeps focus on a field the user went back to after Enter', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      focusField()
      type('//h1')

      press('Enter')
      focusField()
      type('//h2')

      expect(mainSelectorInput()).toHaveFocus()
      expect(mainSelectorInput().value).toBe('//h2')
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h1' })
    })

    it('trims the field when Enter scrapes, so leaving it commits nothing', async () => {
      const onScrape = vi.fn()
      const onChange = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onChange,
        config: { ...config, mainSelector: '//tr' },
      })
      focusField()
      type('//tr ')

      press('Enter')
      act(() => mainSelectorInput().blur())
      await outlastBlurCommit()

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(mainSelectorInput().value).toBe('//tr')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('closes the dropdown when Enter scrapes', async () => {
      const onScrape = vi.fn()
      view = await render({ presets, onScrape, config: { ...config, mainSelector: '//tr' } })
      focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      press('Enter')

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(suggestionItems()).toHaveLength(0)
    })

    it('scrapes a validated selector that was committed with surrounding whitespace', async () => {
      const onScrape = vi.fn()
      const onChange = vi.fn()
      view = await render({
        presets: [],
        onScrape,
        onChange,
        config: { ...config, mainSelector: ' //tr' },
      })
      focusField()

      press('Enter')
      act(() => mainSelectorInput().blur())
      await outlastBlurCommit()

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('still commits on a later blur after a suggestion click and an Enter', async () => {
      const onChange = vi.fn()
      await recentMainSelectorsItem.setValue(['//span'])
      view = await render({ presets: [], onChange })
      focusField()
      type('//sp')
      const row = suggestionItems()[0]!
      act(() => {
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        mainSelectorInput().blur()
        row.click()
      })
      type('//h1')
      press('Enter')

      focusField()
      type('//h2')
      act(() => mainSelectorInput().blur())
      await outlastBlurCommit()

      expect(onChange).toHaveBeenLastCalledWith({ ...config, mainSelector: '//h2' })
    })
  })
})
