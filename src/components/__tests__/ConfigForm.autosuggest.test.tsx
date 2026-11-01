// @vitest-environment jsdom
import { ConfigForm } from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getRecentMainSelectors, setRecentMainSelectors, userPresetsItem } from '@/utils/storage'
import type { Preset, ScrapeConfig } from '@/utils/types'
import { setLastError } from '@@/tests/support/fake-browser'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
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
  config,
  onChange: () => {},
  onScrape: () => {},
  onHighlight: () => {},
  onPickerMode: () => {},
  isLoading: false,
  initialOptions: null,
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

const press = (key: string) =>
  act(() => {
    mainSelectorInput().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    )
  })

/** jsdom runs frame callbacks in the order they were queued, so this one runs after the form's. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

const focusField = () => act(() => mainSelectorInput().focus())

const type = (value: string) => fireEvent.change(mainSelectorInput(), { target: { value: value } })

beforeEach(async () => {
  fakeBrowser.reset()
  setLastError(undefined)
  await userPresetsItem.setValue([])
  await setRecentMainSelectors([])
})

describe('the autosuggest dropdown', () => {
  describe('opening it with an arrow key', () => {
    it('opens on ArrowDown and highlights the first entry', async () => {
      view = await render({ presets })
      // Focus opens it, so close it again to start from a shut dropdown.
      await focusField()
      await press('Escape')
      expect(suggestionItems()).toHaveLength(0)

      await press('ArrowDown')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))
    })

    it('opens on ArrowUp and highlights the last entry', async () => {
      view = await render({ presets })
      await focusField()
      await press('Escape')

      await press('ArrowUp')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))
    })
  })

  describe('moving through an open dropdown', () => {
    it('walks down the list and wraps at the end', async () => {
      view = await render({ presets })
      await focusField()

      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))

      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))
    })

    it('walks up the list and wraps at the start', async () => {
      view = await render({ presets })
      await focusField()

      await press('ArrowUp')

      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('All links'))
    })

    /**
     * Regression test for #270: the arrow handlers used to guard on the preset
     * list while navigating the combined one, so a dropdown showing only
     * recents swallowed the keypress and highlighted nothing.
     */
    it('navigates recents when no preset matches the query', async () => {
      await setRecentMainSelectors(['//span'])
      view = await render({ presets })
      await focusField()
      type('//span')

      await press('ArrowDown')

      await waitFor(() => {
        expect(suggestionItems()).toHaveLength(1)
        expect(selectedSuggestion()?.textContent).toContain('//span')
      })
    })

    it('navigates recents when a preset matches too', async () => {
      await setRecentMainSelectors(['//span'])
      view = await render({ presets })
      await focusField()

      await press('ArrowDown')

      await waitFor(() => {
        expect(suggestionItems()).toHaveLength(3)
        expect(selectedSuggestion()?.textContent).toContain('//span')
      })
    })

    it('does nothing when there is nothing to suggest', async () => {
      view = await render({ presets: [] })
      await focusField()

      await press('ArrowDown')
      await press('ArrowUp')

      expect(selectedSuggestion()).toBeNull()
    })

    it('closes on Escape', async () => {
      view = await render({ presets })
      await focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      await press('Escape')

      expect(suggestionItems()).toHaveLength(0)
    })

    it('ignores Escape when it is already closed', async () => {
      view = await render({ presets })
      await focusField()
      await press('Escape')

      await press('Escape')

      expect(suggestionItems()).toHaveLength(0)
    })

    it('closes on a click outside it', async () => {
      view = await render({ presets })
      await focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      await act(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })

      expect(suggestionItems()).toHaveLength(0)
    })

    it('stays open for a click inside it', async () => {
      view = await render({ presets })
      await focusField()

      await act(() => {
        suggestionItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      })

      expect(suggestionItems()).not.toHaveLength(0)
    })

    it('reopens itself while the user keeps typing', async () => {
      view = await render({ presets })
      await focusField()
      await press('Escape')
      expect(suggestionItems()).toHaveLength(0)

      type('//t')

      expect(suggestionItems()).not.toHaveLength(0)
    })

    it('drops the highlight when the field is cleared', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      await focusField()
      type('//tr')
      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      type('')
      await press('Enter')

      // With nothing highlighted, Enter falls through to the commit path.
      expect(onLoadPreset).not.toHaveBeenCalled()
    })

    it('treats a non-list value in storage as no recents at all', async () => {
      await setRecentMainSelectors(['//span'])
      view = await render({ presets: [] })
      await focusField()
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
      await focusField()

      await waitFor(() => expect(suggestionItems()).toHaveLength(1))
      expect(suggestionItems()[0]!.textContent).toContain('//fresh')
    })
  })

  describe('choosing the highlighted entry with Enter', () => {
    it('loads a highlighted preset', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      await focusField()
      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('Table rows'))

      await press('Enter')

      expect(onLoadPreset).toHaveBeenCalledWith(presets[0])
      expect(mainSelectorInput().value).toBe('//tr')
      expect(suggestionItems()).toHaveLength(0)
    })

    it('commits a highlighted recent selector', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      await setRecentMainSelectors(['//span'])
      view = await render({ presets: [], onChange, onHighlight })
      await focusField()
      await press('ArrowDown')
      await waitFor(() => expect(selectedSuggestion()?.textContent).toContain('//span'))

      await press('Enter')

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//span' }))
      expect(onHighlight).toHaveBeenCalledWith('//span')
    })

    it('does nothing on Enter with an empty field and no highlight', async () => {
      const onScrape = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets, onScrape, onHighlight })
      await focusField()

      await press('Enter')

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
      await focusField()

      await press('Enter')

      await waitFor(() => expect(onScrape).toHaveBeenCalled())
    })
  })

  describe('choosing an entry with the pointer', () => {
    it('loads the preset behind the row', async () => {
      const onLoadPreset = vi.fn()
      view = await render({ presets, onLoadPreset })
      await focusField()

      const row = suggestionItems().find((item) => item.textContent?.includes('Table rows'))!
      await act(() => {
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        row.click()
      })

      expect(onLoadPreset).toHaveBeenCalledWith(presets[0])
    })

    it('does not commit the half-typed draft when the field blurs behind the click', async () => {
      const onChange = vi.fn()
      await setRecentMainSelectors(['//span'])
      view = await render({ presets: [], onChange })
      await focusField()
      type('//sp')

      const row = suggestionItems()[0]!
      await act(() => {
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
      await focusField()
      await press('Escape')
      const scroll = spyOnScroll()

      await press('ArrowDown')
      await nextFrame()

      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
      expect(scrolledEntries(scroll)).toEqual([expect.stringContaining('Table rows')])
    })

    it('scrolls to the last entry when ArrowUp opens the dropdown', async () => {
      view = await render({ presets })
      await focusField()
      await press('Escape')
      const scroll = spyOnScroll()

      await press('ArrowUp')
      await nextFrame()

      expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
      expect(scrolledEntries(scroll)).toEqual([expect.stringContaining('All links')])
    })

    it('follows the highlight as it moves through an open dropdown', async () => {
      view = await render({ presets })
      await focusField()
      const scroll = spyOnScroll()

      await press('ArrowDown')
      await nextFrame()
      await press('ArrowDown')
      await nextFrame()
      await press('ArrowUp')
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
      await focusField()
      await press('Escape')
      const scroll = spyOnScroll()

      await press('ArrowDown')
      await nextFrame()

      expect(view.container.textContent).toContain('No suggestions found')
      expect(scroll).not.toHaveBeenCalled()
    })

    it('scrolls nothing when the dropdown closes before the frame runs', async () => {
      view = await render({ presets })
      await focusField()
      await press('Escape')
      const scroll = spyOnScroll()
      // Holding the frames back is what guarantees Escape lands first; awaiting
      // `act` between the presses can let a real frame through.
      const heldFrames: FrameRequestCallback[] = []
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        heldFrames.push(callback)
        return heldFrames.length
      })

      await press('ArrowDown')
      await press('Escape')
      expect(heldFrames).not.toHaveLength(0)
      await act(() => heldFrames.forEach((callback) => callback(performance.now())))

      expect(suggestionItems()).toHaveLength(0)
      expect(scroll).not.toHaveBeenCalled()
    })
  })

  describe('leaving the field', () => {
    it('commits the draft once the deferred blur runs', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      await focusField()
      type('//h2')

      await act(() => mainSelectorInput().blur())
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mainSelector: '//h2' })),
      )
    })

    it('commits the draft without its surrounding whitespace', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      await focusField()
      await type('  //h2 ')

      await act(() => mainSelectorInput().blur())
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h2' }),
      )
      expect(mainSelectorInput().value).toBe('//h2')
    })

    it('keeps the dropdown open when focus moves into it', async () => {
      const onChange = vi.fn()
      view = await render({ presets, onChange })
      await focusField()
      type('//t')

      await act(() => {
        // cmdk's root carries tabIndex={-1} so it can take focus this way.
        view.container.querySelector<HTMLElement>('[cmdk-root]')!.focus()
        mainSelectorInput().blur()
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      await settleEffects()

      expect(suggestionItems()).not.toHaveLength(0)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not commit when the pointer went down on a suggestion', async () => {
      const onChange = vi.fn()
      await setRecentMainSelectors(['//span'])
      view = await render({ presets: [], onChange })
      await focusField()
      type('//sp')

      await act(() => {
        // Pointer down on the row, then the field loses focus — but the click
        // never lands (the pointer moved away before it was released).
        suggestionItems()[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        mainSelectorInput().blur()
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      await settleEffects()

      expect(onChange).not.toHaveBeenCalled()
    })

    it('cancels a pending blur when focus comes straight back', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      await focusField()
      type('//h2')

      await act(() => mainSelectorInput().blur())
      await focusField()
      await new Promise((resolve) => setTimeout(resolve, 200))
      await settleEffects()

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('forgetting a recent selector', () => {
    it('offers to delete a suggested preset and closes the dropdown', async () => {
      const onDeletePreset = vi.fn()
      view = await render({ presets, onDeletePreset })
      await focusField()

      const row = suggestionItems().find((item) => item.textContent?.includes('All links'))!
      await act(() => row.querySelector<HTMLButtonElement>('button')!.click())

      expect(suggestionItems()).toHaveLength(0)
      expect(document.body.textContent).toContain('Delete Preset')
    })

    it('drops it from storage and keeps the dropdown open', async () => {
      await setRecentMainSelectors(['//span', '//em'])
      view = await render({ presets: [] })
      await focusField()
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
    it('leaves the recents to a scrape that returns rows', async () => {
      view = await render({ presets: [], config: { ...config, mainSelector: '//tr' } })
      await focusField()
      type('//h1')
      await press('Enter')
      await focusField()
      type('//tr')
      await press('Enter')
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
      await focusField()

      await press('Enter')

      await waitFor(() => expect(onHighlight).toHaveBeenCalledWith('//h1'))
      expect(onScrape).not.toHaveBeenCalled()
    })

    /** Outlast the 150ms defer on the blur commit. */
    const letTheBlurCommitFallDue = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

    it('commits an edited selector on the keypress and leaves the field', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets: [], onChange, onHighlight })
      await focusField()
      await type('//h1')

      await press('Enter')

      expect(onChange).toHaveBeenCalledWith({ ...config, mainSelector: '//h1' })
      expect(onHighlight).toHaveBeenCalledWith('//h1')
      expect(mainSelectorInput()).not.toHaveFocus()
      expect(suggestionItems()).toHaveLength(0)
    })

    it('commits once, not again when the blur it causes falls due', async () => {
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ presets: [], onChange, onHighlight })
      await focusField()
      await type('//h1')

      await press('Enter')
      await letTheBlurCommitFallDue()

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onHighlight).toHaveBeenCalledTimes(1)
    })

    it('commits the selector without its surrounding whitespace', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      await focusField()
      await type('  //h1  ')

      await press('Enter')

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
      await focusField()

      await press('Enter')

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(onHighlight).not.toHaveBeenCalled()
    })

    it('keeps focus on a field the user went back to after Enter', async () => {
      const onChange = vi.fn()
      view = await render({ presets: [], onChange })
      await focusField()
      await type('//h1')

      await press('Enter')
      await focusField()
      await type('//h2')

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
      await focusField()
      await type('//tr ')

      await press('Enter')
      await act(() => mainSelectorInput().blur())
      await letTheBlurCommitFallDue()

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(mainSelectorInput().value).toBe('//tr')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('closes the dropdown when Enter scrapes', async () => {
      const onScrape = vi.fn()
      view = await render({ presets, onScrape, config: { ...config, mainSelector: '//tr' } })
      await focusField()
      expect(suggestionItems()).not.toHaveLength(0)

      await press('Enter')

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
      await focusField()

      await press('Enter')
      await act(() => mainSelectorInput().blur())
      await letTheBlurCommitFallDue()

      expect(onScrape).toHaveBeenCalledTimes(1)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('still commits on a later blur after a suggestion click and an Enter', async () => {
      const onChange = vi.fn()
      await setRecentMainSelectors(['//span'])
      view = await render({ presets: [], onChange })
      await focusField()
      await type('//sp')
      const row = suggestionItems()[0]!
      await act(() => {
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        mainSelectorInput().blur()
        row.click()
      })
      await type('//h1')
      await press('Enter')

      await focusField()
      await type('//h2')
      await act(() => mainSelectorInput().blur())
      await letTheBlurCommitFallDue()

      expect(onChange).toHaveBeenLastCalledWith({ ...config, mainSelector: '//h2' })
    })
  })
})
