// @vitest-environment jsdom
import ConfigForm from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { setRecentMainSelectors, userPresetsStorage } from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import { SYSTEM_PRESET_STATUS_KEY, type Preset, type ScrapeConfig } from '@/utils/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import { useState } from 'react'
import {
  type RenderResult,
  act,
  fireEvent,
  render as renderComponent,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { stubOffsetWidth } from '@@/tests/support/dom'

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

/** Render, and let mount-time storage reads settle before asserting. */
const render = async (overrides: Partial<ConfigFormProps> = {}) => {
  const rendered = renderComponent(
    <TooltipProvider>
      <ConfigForm {...baseProps()} {...overrides} />
    </TooltipProvider>,
  )
  await act(async () => {})
  return rendered
}

/** A ConfigForm whose parent actually applies the config it reports. */
const ControlledConfigForm = () => {
  const [current, setCurrent] = useState(config)
  return <ConfigForm {...baseProps()} config={current} onChange={setCurrent} />
}

const mainSelectorInput = () =>
  view.container.querySelector<HTMLTextAreaElement>('textarea#mainSelector')!
const columnNameInputs = () => [
  ...view.container.querySelectorAll<HTMLInputElement>('input[placeholder="Column name"]'),
]
const columnSelectorInputs = () => [
  ...view.container.querySelectorAll<HTMLInputElement>('input[placeholder="Selector"]'),
]
const button = (label: string) =>
  view.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const allButtons = (label: string) => [
  ...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
]
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
  // jsdom measures everything as 0; restore that between tests that stub it.
  stubOffsetWidth(0)
  await userPresetsStorage.setValue([])
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

      fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })

      expect(onChange).not.toHaveBeenCalled()
      expect(mainSelectorInput().value).toBe('//li')
    })

    it('collapses pasted line breaks into spaces', async () => {
      view = await render()

      fireEvent.change(mainSelectorInput(), { target: { value: '//table\n//tr' } })

      expect(mainSelectorInput().value).toBe('//table //tr')
    })

    it('commits the change and asks for a highlight on blur', async () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      const onHighlight = vi.fn()
      view = await render({ onChange, onHighlight })

      fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })
      await act(() => {
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

      fireEvent.change(mainSelectorInput(), { target: { value: '   ' } })
      await act(() => {
        // React delivers onBlur from the bubbling focusout event.
        mainSelectorInput().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        vi.advanceTimersByTime(200)
      })

      expect(onHighlight).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('follows a selector changed by its parent', async () => {
      view = await render()

      view.rerender(
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

      fireEvent.change(columnNameInputs()[0]!, { target: { value: 'Position' } })

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [{ name: 'Position', selector: './td[1]' }, config.columns[1]],
      })
    })

    it('reports a repointed column', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      fireEvent.change(columnSelectorInputs()[1]!, { target: { value: '@data-country' } })

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [config.columns[0], { name: 'Country', selector: '@data-country' }],
      })
    })

    it('adds a numbered column', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await userEvent.click(button('Add column'))

      expect(onChange).toHaveBeenCalledWith({
        ...config,
        columns: [...config.columns, { name: 'Column 3', selector: '.' }],
      })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ADD_COLUMN_BUTTON_PRESS)
    })

    it('removes a column and records the removal', async () => {
      const onChange = vi.fn()
      view = await render({ onChange })

      await userEvent.click(allButtons('Remove column')[0]!)

      expect(onChange).toHaveBeenCalledWith({ ...config, columns: [config.columns[1]] })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.REMOVE_COLUMN_BUTTON_PRESS)
    })
  })

  describe('the scrape button', () => {
    it('scrapes when the selector is validated', async () => {
      const onScrape = vi.fn()
      view = await render({ onScrape })

      await userEvent.click(byText('Scrape'))

      expect(onScrape).toHaveBeenCalled()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS)
    })

    it('offers to validate instead while the selector is unsaved', async () => {
      view = await render()

      fireEvent.change(mainSelectorInput(), { target: { value: '//li' } })

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

      await act(() => {
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

      await userEvent.click(button('Open visual picker'))

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

      const badge = view.container.querySelector('[data-slot="badge"]')!
      expect(badge.textContent).toBe('0')
    })
  })

  describe('auto-generating the config', () => {
    /** Reply to the guess request with `response`. */
    const contentScriptReplies = (response: unknown) =>
      spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockImplementation(
        (_tabId: number, _message: unknown, callback?: (r: unknown) => void) => {
          callback?.(response)
          return Promise.resolve(response)
        },
      )

    /** Report `tabs` as the current window's active tabs. */
    const activeTabs = (tabs: Browser.tabs.Tab[]) =>
      spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
        (_query: unknown, callback?: (found: Browser.tabs.Tab[]) => void) => {
          callback?.(tabs)
          return Promise.resolve(tabs)
        },
      )

    const guessButton = () => button('Auto-generate configuration from selector')

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

      await act(async () => {
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

    it('is not offered without a selector to guess from', async () => {
      const query = spyOnBrowser(fakeBrowser.tabs, 'query')
      view = await render({ config: { ...config, mainSelector: '' } })

      expect(guessButton().disabled).toBe(true)
      await userEvent.click(guessButton())

      expect(query).not.toHaveBeenCalled()
    })

    it('is not offered while the selector is still uncommitted', async () => {
      view = await render()

      fireEvent.change(mainSelectorInput(), { target: { value: '//td' } })

      expect(guessButton().disabled).toBe(true)
    })

    it('shows the success state and settles back to idle', async () => {
      vi.useFakeTimers()
      contentScriptReplies({ success: true })
      activeTabs([{ id: 4 } as Browser.tabs.Tab])
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      expect(guessButton().querySelector('.lucide-check')).not.toBeNull()

      await act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(guessButton().querySelector('.lucide-wand')).not.toBeNull()
      vi.useRealTimers()
    })

    it('shows the failure state when the content script refuses', async () => {
      contentScriptReplies({ success: false })
      activeTabs([{ id: 4 } as Browser.tabs.Tab])
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      expect(guessButton().querySelector('.lucide-x')).not.toBeNull()
    })

    it('shows the failure state when there is no active tab', async () => {
      const sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage')
      activeTabs([])
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      expect(sendMessage).not.toHaveBeenCalled()
      expect(guessButton().querySelector('.lucide-x')).not.toBeNull()
    })

    it('shows the failure state when the query itself throws', async () => {
      spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(() => {
        throw new Error('no tabs permission')
      })
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      expect(guessButton().querySelector('.lucide-x')).not.toBeNull()
    })

    it('spins and stays disabled while the guess is in flight', async () => {
      let release: (() => void) | undefined
      spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(
        (_query: unknown, callback?: (found: Browser.tabs.Tab[]) => void) => {
          release = () => callback?.([])
          return new Promise(() => {})
        },
      )
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      expect(guessButton().querySelector('.lucide-loader-circle')).not.toBeNull()
      expect(guessButton().disabled).toBe(true)

      await act(() => release!())
    })

    it('settles a failed guess back to idle', async () => {
      vi.useFakeTimers()
      contentScriptReplies({ success: false })
      activeTabs([{ id: 4 } as Browser.tabs.Tab])
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })
      expect(guessButton().querySelector('.lucide-x')).not.toBeNull()

      await act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(guessButton().querySelector('.lucide-wand')).not.toBeNull()
      vi.useRealTimers()
    })

    it('settles back to idle after there was no tab', async () => {
      vi.useFakeTimers()
      activeTabs([])
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      await act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(guessButton().querySelector('.lucide-wand')).not.toBeNull()
      vi.useRealTimers()
    })

    it('settles back to idle after the query threw', async () => {
      vi.useFakeTimers()
      spyOnBrowser(fakeBrowser.tabs, 'query').mockImplementation(() => {
        throw new Error('no tabs permission')
      })
      view = await render()

      await act(async () => {
        guessButton().click()
        await Promise.resolve()
      })

      await act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(guessButton().querySelector('.lucide-wand')).not.toBeNull()
      vi.useRealTimers()
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

      await act(() => mainSelectorInput().focus())

      expect(view.container.textContent).toContain('Table rows')
      expect(view.container.textContent).toContain('//span')
    })

    it('narrows the suggestions as the user types', async () => {
      view = await render({ presets, config: { ...config, mainSelector: '' } })
      await act(() => mainSelectorInput().focus())

      fireEvent.change(mainSelectorInput(), { target: { value: 'links' } })

      expect(view.container.textContent).toContain('All links')
      expect(view.container.textContent).not.toContain('Table rows')
    })

    describe('saving one', () => {
      /** Open the Save drawer and return its name field. */
      const openSaveDrawer = async () => {
        await userEvent.click(byText('Save'))
        return document.body.querySelector<HTMLInputElement>('input[placeholder="Preset name"]')!
      }

      const drawerButton = (label: string) =>
        [...document.querySelectorAll<HTMLButtonElement>('[data-slot="drawer-content"] button')]
          .filter((candidate) => candidate.textContent?.trim() === label)
          .at(-1)!

      it('will not save without a name', async () => {
        view = await render()

        await openSaveDrawer()

        expect(drawerButton('Save').disabled).toBe(true)
      })

      it('saves under the typed name, closes the drawer and says so', async () => {
        const onSavePreset = vi.fn()
        view = await render({ onSavePreset })
        const nameField = await openSaveDrawer()

        fireEvent.change(nameField, { target: { value: 'My preset' } })
        await act(async () => {
          drawerButton('Save').click()
          await Promise.resolve()
        })

        expect(onSavePreset).toHaveBeenCalledWith('My preset')
        await waitFor(() => expect(toastMocks.toast.success).toHaveBeenCalled())
      })

      it('saves on Enter in the name field', async () => {
        const onSavePreset = vi.fn()
        view = await render({ onSavePreset })
        const nameField = await openSaveDrawer()
        fireEvent.change(nameField, { target: { value: 'From the keyboard' } })

        await act(async () => {
          nameField.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          )
          await Promise.resolve()
        })

        expect(onSavePreset).toHaveBeenCalledWith('From the keyboard')
      })

      it('ignores Enter while the name is blank', async () => {
        const onSavePreset = vi.fn()
        view = await render({ onSavePreset })
        const nameField = await openSaveDrawer()

        await act(() => {
          nameField.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          )
        })

        expect(onSavePreset).not.toHaveBeenCalled()
      })
    })

    describe('loading one', () => {
      /** Open the Load popover and return the preset rows inside it. */
      const openLoadPopover = async () => {
        await userEvent.click(byText('Load'))
        return () => [...document.querySelectorAll<HTMLElement>('[cmdk-item]')]
      }

      it('loads the preset the user picks', async () => {
        const onLoadPreset = vi.fn()
        view = await render({ presets, onLoadPreset })
        const rows = await openLoadPopover()

        await act(() =>
          rows()
            .find((row) => row.textContent?.includes('All links'))!
            .click(),
        )

        expect(onLoadPreset).toHaveBeenCalledWith(presets[1])
      })

      it('narrows the list by the search term', async () => {
        view = await render({ presets })
        await openLoadPopover()
        const search = document.body.querySelector<HTMLInputElement>(
          'input[placeholder="Search presets..."]',
        )!

        fireEvent.change(search, { target: { value: 'links' } })

        await waitFor(() => {
          expect(document.body.textContent).toContain('All links')
          expect(document.body.textContent).not.toContain('Table rows')
        })
      })

      it('says so when nothing is saved yet', async () => {
        view = await render({ presets: [] })

        await openLoadPopover()

        expect(document.body.textContent).toContain('No presets saved')
      })
    })

    describe('deleting one', () => {
      // `isSystemPreset` matches on id, so borrow a real built-in one.
      const systemPreset: Preset = {
        ...preset(SYSTEM_PRESETS[0]!.id, 'Built in', '//table'),
      }

      const deleteButtonFor = async (name: string) => {
        await userEvent.click(byText('Load'))
        const row = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((candidate) =>
          candidate.textContent?.includes(name),
        )!
        return row.querySelector<HTMLButtonElement>('button')!
      }

      const drawerText = () =>
        document.querySelector<HTMLElement>('[data-slot="drawer-content"]')!?.textContent ?? ''

      /** The drawer stays mounted while it animates out, so read its state. */
      const openDrawer = () =>
        document.querySelector('[data-slot="drawer-content"][data-state="open"]')!

      it('asks for confirmation before deleting a user preset', async () => {
        view = await render({ presets })

        const remove = await deleteButtonFor('All links')
        await userEvent.click(remove)

        expect(drawerText()).toContain('Delete Preset')
        expect(drawerText()).toContain('This action cannot be undone.')
      })

      it('offers to hide a system preset instead of deleting it', async () => {
        view = await render({ presets: [systemPreset] })

        const remove = await deleteButtonFor('Built in')
        await userEvent.click(remove)

        expect(drawerText()).toContain('Hide Preset')
        expect(drawerText()).not.toContain('This action cannot be undone.')
      })

      it('deletes once confirmed', async () => {
        const onDeletePreset = vi.fn()
        view = await render({ presets, onDeletePreset })
        const remove = await deleteButtonFor('All links')
        await userEvent.click(remove)

        await act(() =>
          [...document.querySelectorAll<HTMLButtonElement>('button')]
            .find((candidate) => candidate.textContent?.trim() === 'Delete')!
            .click(),
        )

        expect(onDeletePreset).toHaveBeenCalledWith(presets[1])
        expect(openDrawer()).toBeNull()
      })

      it('ignores a second confirm while the drawer is closing', async () => {
        const onDeletePreset = vi.fn()
        view = await render({ presets, onDeletePreset })
        const remove = await deleteButtonFor('All links')
        await userEvent.click(remove)
        const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
          (candidate) => candidate.textContent?.trim() === 'Delete',
        )!

        await userEvent.click(confirm)
        // The drawer animates out, so the button is still clickable for a beat.
        await userEvent.click(confirm)

        expect(onDeletePreset).toHaveBeenCalledTimes(1)
      })

      it('leaves the preset alone when cancelled', async () => {
        const onDeletePreset = vi.fn()
        view = await render({ presets, onDeletePreset })
        const remove = await deleteButtonFor('All links')
        await userEvent.click(remove)

        await act(() =>
          [...document.querySelectorAll<HTMLButtonElement>('button')]
            .find((candidate) => candidate.textContent?.trim() === 'Cancel')!
            .click(),
        )

        expect(onDeletePreset).not.toHaveBeenCalled()
        expect(openDrawer()).toBeNull()
      })
    })
  })

  it('opens the XPath reference in a new tab', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    view = await render()

    await userEvent.click(button('Open XPath reference'))

    expect(open).toHaveBeenCalledWith(
      'https://www.stylusstudio.com/docs/v62/d_xpath15.html',
      '_blank',
      'noopener,noreferrer',
    )
    vi.unstubAllGlobals()
  })

  it('insets the selector field by the width of its adornments', async () => {
    stubOffsetWidth(40)
    view = await render()

    expect(mainSelectorInput().style.paddingRight).toBe('42px')
    expect(mainSelectorInput().style.paddingLeft).toBe('42px')
  })

  it('scrolls the columns strip to the newly added column', async () => {
    const scrollTo = vi.fn()
    view = renderComponent(
      <TooltipProvider>
        <ControlledConfigForm />
      </TooltipProvider>,
    )
    const strip = view.container.querySelector<HTMLElement>('.grid.grid-flow-col')!
    strip.scrollTo = scrollTo as unknown as HTMLElement['scrollTo']

    await userEvent.click(button('Add column'))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('respects a hidden system preset', async () => {
    await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, {})

    view = await render()

    expect(view.container.textContent).toContain('Configuration')
  })
})
