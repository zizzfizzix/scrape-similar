// @vitest-environment jsdom
import {
  applyCrosshairCursor,
  buildPickerSelection,
  disablePickerMode,
  enablePickerMode,
  handlePickerClick,
  handlePickerKeyDown,
  handlePickerMouseMove,
  removeCrosshairCursor,
} from '@/entrypoints/content/picker'
import { createState, type ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { MESSAGE_TYPES } from '@/utils/types'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const bannerMocks = vi.hoisted(() => ({
  mountPickerBanner: vi.fn(),
  unmountPickerBanner: vi.fn(),
  updatePickerBannerContent: vi.fn(),
  getPickerBannerElement: vi.fn<() => { getBoundingClientRect: () => DOMRect } | null>(),
  updateBodyMarginForBanner: vi.fn(),
  restoreFixedElements: vi.fn(),
}))
vi.mock('@/entrypoints/content/picker/banner', () => bannerMocks)

const highlightMocks = vi.hoisted(() => ({
  highlightElementsForPicker: vi.fn(),
  highlightMatchingElements: vi.fn(),
  removePickerHighlights: vi.fn(),
}))
vi.mock('@/entrypoints/content/highlight', () => highlightMocks)

const ctx = {} as ContentScriptContext

let state: ContentScriptState

/** Reply to every runtime.sendMessage with `response`. */
const backgroundReplies = (response: unknown, lastError?: { message?: string }) =>
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
    (_message: unknown, callback?: (r: unknown) => void) => {
      setLastError(lastError)
      callback?.(response)
      setLastError(undefined)
      return Promise.resolve(response)
    },
  )

beforeEach(() => {
  fakeBrowser.reset()
  setLastError(undefined)
  document.head.innerHTML = ''
  document.body.innerHTML = '<ul><li id="first">a</li><li>b</li></ul>'
  document.documentElement.className = ''
  document.documentElement.style.marginTop = ''
  state = createState()
  state.tabId = 3
  // jsdom has no layout engine, so hit testing is not implemented.
  document.elementFromPoint = vi.fn(() => null) as typeof document.elementFromPoint
  bannerMocks.mountPickerBanner.mockResolvedValue(undefined)
  bannerMocks.getPickerBannerElement.mockReturnValue(null)
  backgroundReplies({ success: true })
})

afterEach(() => {
  removeCrosshairCursor()
})

describe('applyCrosshairCursor', () => {
  it('injects the cursor style and marks the document active', () => {
    applyCrosshairCursor()

    expect(document.getElementById('scrape-similar-picker-cursor')).not.toBeNull()
    expect(document.documentElement).toHaveClass('scrape-similar-picker-active')
  })

  it('injects the style only once', () => {
    applyCrosshairCursor()
    applyCrosshairCursor()

    expect(document.querySelectorAll('#scrape-similar-picker-cursor')).toHaveLength(1)
  })
})

describe('removeCrosshairCursor', () => {
  it('removes the style and the marker class', () => {
    applyCrosshairCursor()

    removeCrosshairCursor()

    expect(document.getElementById('scrape-similar-picker-cursor')).toBeNull()
    expect(document.documentElement).not.toHaveClass('scrape-similar-picker-active')
  })

  it('does nothing when the cursor was never applied', () => {
    expect(() => removeCrosshairCursor()).not.toThrow()
  })
})

describe('buildPickerSelection', () => {
  const element = () => document.querySelector<HTMLElement>('#first')!

  it('uses the selected candidate as the main selector', () => {
    state.selectorCandidates = ['//li[1]', '//li']
    state.selectedCandidateIndex = 1
    state.currentGuessedConfig = {
      mainSelector: 'ignored',
      columns: [{ name: 'Item', selector: '.' }],
    }

    const selection = buildPickerSelection(element(), state)

    expect(selection.config).toEqual({
      mainSelector: '//li',
      columns: [{ name: 'Item', selector: '.' }],
    })
  })

  it('falls back to the element’s own path when there is no candidate', () => {
    const selection = buildPickerSelection(element(), state)

    expect(selection.config.mainSelector).toBe(selection.xpath)
  })

  it('guesses the columns when none are cached', () => {
    const selection = buildPickerSelection(element(), state)

    expect(selection.config.columns).toEqual([{ name: 'List Item', selector: '.' }])
  })

  it('reports the clicked element’s text and markup', () => {
    const selection = buildPickerSelection(element(), state)

    expect(selection.elementDetails).toEqual({
      xpath: selection.xpath,
      text: 'a',
      html: '<li id="first">a</li>',
    })
  })

  it('reports empty text for an element with none', () => {
    document.body.innerHTML = '<div id="empty"></div>'

    const selection = buildPickerSelection(document.querySelector<HTMLElement>('#empty')!, state)

    expect(selection.elementDetails.text).toBe('')
  })
})

describe('handlePickerMouseMove', () => {
  let requestAnimationFrame: MockInstance<typeof window.requestAnimationFrame>

  beforeEach(() => {
    state.pickerModeActive = true
    requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0)
        return 1
      })
  })

  const move = (x: number, y: number) =>
    handlePickerMouseMove({ clientX: x, clientY: y } as MouseEvent, state)

  it('records the pointer position and schedules an update', () => {
    move(10, 20)

    expect(state.lastMouseX).toBe(10)
    expect(state.lastMouseY).toBe(20)
    expect(requestAnimationFrame).toHaveBeenCalled()
  })

  it('does nothing while picker mode is off', () => {
    state.pickerModeActive = false

    move(10, 20)

    expect(state.lastMouseX).toBe(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('does nothing while the context menu is open', () => {
    state.pickerContextMenuOpen = true

    move(10, 20)

    expect(state.lastMouseX).toBe(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('coalesces several moves into one scheduled update', () => {
    requestAnimationFrame.mockImplementation(() => 1) // never run the callback

    move(10, 20)
    move(30, 40)

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(state.lastMouseX).toBe(30)
  })

  describe('the scheduled update', () => {
    const hover = (element: Element | null) =>
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(element)

    it('highlights the hovered element’s matches and updates the banner', () => {
      hover(document.querySelector('#first'))

      move(10, 20)

      expect(state.currentHoveredElement).toBe(document.querySelector('#first'))
      expect(highlightMocks.highlightElementsForPicker).toHaveBeenCalled()
      expect(bannerMocks.updatePickerBannerContent).toHaveBeenCalledWith(
        2,
        state.currentXPath,
        state,
      )
    })

    it('caches the guessed config for the eventual click', () => {
      hover(document.querySelector('#first'))

      move(10, 20)

      expect(state.currentGuessedConfig?.columns).toEqual([{ name: 'List Item', selector: '.' }])
    })

    it('does nothing when the update runs after picker mode was turned off', () => {
      let scheduled: FrameRequestCallback | undefined
      requestAnimationFrame.mockImplementation((callback: FrameRequestCallback) => {
        scheduled = callback
        return 1
      })
      hover(document.querySelector('#first'))

      move(10, 20)
      state.pickerModeActive = false
      scheduled?.(0)

      expect(state.currentHoveredElement).toBeNull()
    })

    it('clears the selection while the pointer is over the banner', () => {
      state.currentHoveredElement = document.querySelector<HTMLElement>('#first')
      bannerMocks.getPickerBannerElement.mockReturnValue({
        getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 50 }) as DOMRect,
      })

      move(10, 20)

      expect(state.currentHoveredElement).toBeNull()
      expect(state.currentXPath).toBe('')
      expect(bannerMocks.updatePickerBannerContent).toHaveBeenCalledWith(0, '', state)
    })

    it('keeps going when the pointer is below the banner', () => {
      bannerMocks.getPickerBannerElement.mockReturnValue({
        getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 50 }) as DOMRect,
      })
      hover(document.querySelector('#first'))

      move(10, 80)

      expect(state.currentHoveredElement).not.toBeNull()
    })

    it('clears the selection over the extension’s own UI', () => {
      document.body.innerHTML = '<div data-wxt-shadow-root><span id="inside">x</span></div>'
      hover(document.querySelector('#inside'))

      move(10, 20)

      expect(state.currentHoveredElement).toBeNull()
      expect(bannerMocks.updatePickerBannerContent).toHaveBeenCalledWith(0, '', state)
    })

    it('clears the selection when no selector describes the element', () => {
      hover(document.body)

      move(10, 20)

      expect(state.currentXPath).toBe('')
      expect(bannerMocks.updatePickerBannerContent).toHaveBeenCalledWith(0, '', state)
    })

    it('does nothing when the pointer is over no element', () => {
      hover(null)

      move(10, 20)

      expect(bannerMocks.updatePickerBannerContent).not.toHaveBeenCalled()
    })

    it('does nothing when the pointer is over a non-HTML node', () => {
      hover(document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as Element)

      move(10, 20)

      expect(bannerMocks.updatePickerBannerContent).not.toHaveBeenCalled()
    })

    it('skips the work when the same element is still hovered', () => {
      hover(document.querySelector('#first'))
      move(10, 20)
      bannerMocks.updatePickerBannerContent.mockClear()

      move(11, 21)

      expect(bannerMocks.updatePickerBannerContent).not.toHaveBeenCalled()
    })

    it('lets the pointer through the banner while probing', () => {
      const bannerRoot = document.createElement('div')
      bannerRoot.style.pointerEvents = 'auto'
      state.bannerRootEl = bannerRoot as HTMLDivElement
      const elementFromPoint = hover(document.querySelector('#first'))

      move(10, 20)

      expect(elementFromPoint).toHaveBeenCalled()
      expect(bannerRoot.style.pointerEvents).toBe('auto')
    })
  })
})

describe('handlePickerKeyDown', () => {
  let disable: ReturnType<typeof vi.fn<(source?: string) => void>>

  const press = (key: string) => {
    const event = { key, preventDefault: vi.fn() }
    handlePickerKeyDown(event as unknown as KeyboardEvent, state, disable)
    return event
  }

  beforeEach(() => {
    disable = vi.fn<(source?: string) => void>()
    state.pickerModeActive = true
    state.selectorCandidates = ['//li[1]', '//li', '//ul']
    state.selectedCandidateIndex = 1
  })

  it('leaves picker mode on Escape', () => {
    const event = press('Escape')

    expect(disable).toHaveBeenCalledWith('escape')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('does nothing while picker mode is off', () => {
    state.pickerModeActive = false

    press('Escape')

    expect(disable).not.toHaveBeenCalled()
  })

  it('narrows the selector on "+"', () => {
    press('+')

    expect(state.selectedCandidateIndex).toBe(0)
  })

  it('narrows the selector on "=" too', () => {
    press('=')

    expect(state.selectedCandidateIndex).toBe(0)
  })

  it('broadens the selector on "-"', () => {
    press('-')

    expect(state.selectedCandidateIndex).toBe(2)
  })

  it('broadens the selector on "_" too', () => {
    press('_')

    expect(state.selectedCandidateIndex).toBe(2)
  })

  it('stops at the most specific candidate', () => {
    state.selectedCandidateIndex = 0

    press('+')

    expect(state.selectedCandidateIndex).toBe(0)
  })

  it('stops at the broadest candidate', () => {
    state.selectedCandidateIndex = 2

    press('-')

    expect(state.selectedCandidateIndex).toBe(2)
  })

  it('does nothing when there are no candidates', () => {
    state.selectorCandidates = []

    press('+')

    expect(state.selectedCandidateIndex).toBe(1)
  })

  it('ignores keys it does not handle', () => {
    const event = press('a')

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })
})

describe('handlePickerClick', () => {
  let disable: ReturnType<typeof vi.fn<(source?: string) => void>>
  let sendMessage: ReturnType<typeof backgroundReplies>

  const click = (path: EventTarget[] = [document.querySelector('#first')!]) => {
    const event = {
      clientX: 10,
      clientY: 20,
      composedPath: () => path,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    return { event, result: handlePickerClick(event as unknown as MouseEvent, state, disable) }
  }

  beforeEach(() => {
    disable = vi.fn<(source?: string) => void>()
    state.pickerModeActive = true
    state.selectorCandidates = ['//li[1]', '//li']
    state.selectedCandidateIndex = 1
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.querySelector('#first'))
    sendMessage = backgroundReplies({ success: true })
  })

  it('stores the config, highlights, scrapes and reopens the side panel', async () => {
    const { event, result } = click()
    await result

    expect(event.preventDefault).toHaveBeenCalled()
    expect(disable).toHaveBeenCalledWith('element_selected')
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          updates: expect.objectContaining({
            currentScrapeConfig: expect.objectContaining({ mainSelector: '//li' }),
          }),
        }),
      }),
      expect.any(Function),
    )
    expect(highlightMocks.highlightMatchingElements).toHaveBeenCalledWith(
      [...document.querySelectorAll('li')],
      { shouldScroll: false },
    )
    expect(sendMessage).toHaveBeenCalledWith({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })
  })

  it('records the highlight as validated', async () => {
    await click().result

    expect(sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: {
        tabId: 3,
        updates: { highlightMatchCount: 2, highlightError: null },
      },
    })
  })

  it('tracks the selection, the highlight and the scrape', async () => {
    await click().result

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_ELEMENT_SELECT, {
      elements_matched: 2,
      selector_level: 1,
      total_levels: 2,
    })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
      elements_count: 2,
      is_row_highlight: false,
    })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SCRAPE_COMPLETION, {
      items_scraped: 2,
      columns_count: 1,
    })
  })

  it('measures the selection against the element’s own path when no candidate is chosen', async () => {
    state.selectorCandidates = []
    state.selectedCandidateIndex = 0

    await click().result

    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PICKER_ELEMENT_SELECT,
      expect.objectContaining({ total_levels: 0 }),
    )
  })

  it('does nothing while picker mode is off', async () => {
    state.pickerModeActive = false

    const { event, result } = click()
    await result

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(disable).not.toHaveBeenCalled()
  })

  it('lets a click on the banner through', async () => {
    const banner = document.createElement('div')
    state.bannerRootEl = banner as HTMLDivElement

    const { event, result } = click([banner])
    await result

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('lets a click on the context menu through', async () => {
    const host = document.createElement('div')
    state.pickerContextMenuHost = host as HTMLDivElement

    const { event, result } = click([host])
    await result

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('stops when the click landed on no element', async () => {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null)

    await click().result

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('stops when the click landed on a non-HTML node', async () => {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(
      document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as Element,
    )

    await click().result

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('stops before the tab id is known', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    state.tabId = null

    await click().result

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('gives up when the config cannot be stored', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    sendMessage = backgroundReplies({ success: false, error: 'session gone' })

    await click().result

    expect(highlightMocks.highlightMatchingElements).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('Error in picker click handler:', expect.any(Error))
  })

  it('names the failure generically when the background gives no reason', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    sendMessage = backgroundReplies({ success: false })

    await click().result

    expect(errorSpy).toHaveBeenCalledWith(
      'Error in picker click handler:',
      expect.objectContaining({ message: 'Failed to save config' }),
    )
  })

  it('gives up when the background cannot be reached', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    sendMessage = backgroundReplies(undefined, { message: 'port closed' })

    await click().result

    expect(highlightMocks.highlightMatchingElements).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      'Error saving picker config to background:',
      expect.anything(),
    )
  })

  it('logs but does not reopen the panel when the result cannot be stored', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    let call = 0
    sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: unknown, callback?: (r: unknown) => void) => {
        call += 1
        // The first callback stores the config; the second stores the result.
        const response = call === 1 ? { success: true } : { success: false, error: 'full' }
        callback?.(response)
        return Promise.resolve(response)
      },
    )

    await click().result

    expect(errorSpy).toHaveBeenCalledWith('Failed to save picker scrape result:', 'full')
    expect(sendMessage).not.toHaveBeenCalledWith({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })
  })

  it('logs when the result message cannot be delivered', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    let call = 0
    sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: unknown, callback?: (r: unknown) => void) => {
        call += 1
        if (call > 1) setLastError({ message: 'port closed' })
        callback?.({ success: true })
        setLastError(undefined)
        return Promise.resolve({ success: true })
      },
    )

    await click().result

    expect(errorSpy).toHaveBeenCalledWith(
      'Error sending picker scrape result to background:',
      expect.anything(),
    )
  })
})

describe('enablePickerMode', () => {
  let disable: ReturnType<typeof vi.fn<(source?: string) => void>>
  let sendMessage: ReturnType<typeof backgroundReplies>

  beforeEach(() => {
    disable = vi.fn<(source?: string) => void>()
    sendMessage = backgroundReplies({ success: true })
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null)
  })

  it('turns on picker mode, the crosshair and the banner', async () => {
    await enablePickerMode(ctx, state, disable, 'keyboard_shortcut')

    expect(state.pickerModeActive).toBe(true)
    expect(document.documentElement).toHaveClass('scrape-similar-picker-active')
    expect(bannerMocks.mountPickerBanner).toHaveBeenCalledWith(ctx, state, disable)
    expect(state.pickerEventHandlers).not.toBeNull()
  })

  it('tracks the source that turned it on', async () => {
    await enablePickerMode(ctx, state, disable, 'keyboard_shortcut')

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_MODE_ENABLE, {
      source: 'keyboard_shortcut',
    })
  })

  it('records an unknown source when none is given', async () => {
    await enablePickerMode(ctx, state, disable)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_MODE_ENABLE, {
      source: 'unknown',
    })
  })

  it('publishes the new state to the side panel', async () => {
    await enablePickerMode(ctx, state, disable)

    expect(sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: { tabId: 3, updates: { pickerModeActive: true } },
    })
  })

  it('skips publishing before the tab id is known', async () => {
    state.tabId = null

    await enablePickerMode(ctx, state, disable)

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does nothing when picker mode is already on', async () => {
    state.pickerModeActive = true

    await enablePickerMode(ctx, state, disable)

    expect(bannerMocks.mountPickerBanner).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('starts from the viewport centre when the pointer has not moved', async () => {
    await enablePickerMode(ctx, state, disable)

    expect(state.lastMouseX).toBe(window.innerWidth / 2)
    expect(state.lastMouseY).toBe(window.innerHeight / 2)
  })

  it('keeps a known pointer position', async () => {
    state.lastMouseX = 42
    state.lastMouseY = 84

    await enablePickerMode(ctx, state, disable)

    expect(state.lastMouseX).toBe(42)
  })

  it('registers handlers that drive the picker', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener')

    await enablePickerMode(ctx, state, disable)

    for (const type of ['mousemove', 'click', 'keydown', 'contextmenu', 'mousedown']) {
      expect(addEventListener).toHaveBeenCalledWith(type, expect.any(Function), true)
    }
  })

  it('re-offsets the page when the window is resized', async () => {
    await enablePickerMode(ctx, state, disable)
    bannerMocks.updateBodyMarginForBanner.mockClear()

    state.pickerEventHandlers!.resizeHandler()

    expect(bannerMocks.updateBodyMarginForBanner).toHaveBeenCalledWith(state)
  })
})

describe('disablePickerMode', () => {
  let sendMessage: ReturnType<typeof backgroundReplies>

  beforeEach(async () => {
    sendMessage = backgroundReplies({ success: true })
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null)
    await enablePickerMode(ctx, state, vi.fn())
    sendMessage.mockClear()
    trackEvent.mockClear()
  })

  it('turns off picker mode and tears down the UI', () => {
    disablePickerMode(state, 'escape')

    expect(state.pickerModeActive).toBe(false)
    expect(document.documentElement).not.toHaveClass('scrape-similar-picker-active')
    expect(bannerMocks.unmountPickerBanner).toHaveBeenCalledWith(state)
    expect(highlightMocks.removePickerHighlights).toHaveBeenCalledWith(state.highlightedElements)
    expect(bannerMocks.restoreFixedElements).toHaveBeenCalledWith(state)
  })

  it('tracks the source that turned it off', () => {
    disablePickerMode(state, 'escape')

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_MODE_DISABLE, {
      source: 'escape',
    })
  })

  it('records an unknown source when none is given', () => {
    disablePickerMode(state)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_MODE_DISABLE, {
      source: 'unknown',
    })
  })

  it('publishes the new state to the side panel', () => {
    disablePickerMode(state)

    expect(sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
      payload: { tabId: 3, updates: { pickerModeActive: false } },
    })
  })

  it('skips publishing when the tab id is unknown', () => {
    state.tabId = null

    disablePickerMode(state)

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('unregisters every handler it registered', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    disablePickerMode(state)

    for (const type of ['mousemove', 'click', 'keydown', 'contextmenu', 'mousedown']) {
      expect(removeEventListener).toHaveBeenCalledWith(type, expect.any(Function), true)
    }
    expect(state.pickerEventHandlers).toBeNull()
  })

  it('forgets the hovered element', () => {
    state.currentHoveredElement = document.querySelector<HTMLElement>('#first')
    state.currentXPath = '//li'

    disablePickerMode(state)

    expect(state.currentHoveredElement).toBeNull()
    expect(state.currentXPath).toBe('')
  })

  it('restores an inline page margin it had replaced', () => {
    state.originalBodyMarginTopInline = '4px'
    document.documentElement.style.setProperty('margin-top', '54px', 'important')

    disablePickerMode(state)

    expect(document.documentElement.style.marginTop).toBe('4px')
    expect(state.originalBodyMarginTopInline).toBeNull()
    expect(state.originalBodyMarginTopComputedPx).toBeNull()
  })

  it('removes the page margin entirely when the page had none', () => {
    state.originalBodyMarginTopInline = ''
    document.documentElement.style.setProperty('margin-top', '54px', 'important')

    disablePickerMode(state)

    expect(document.documentElement.style.marginTop).toBe('')
  })

  it('removes the page margin when the page had only whitespace', () => {
    state.originalBodyMarginTopInline = '   '
    document.documentElement.style.setProperty('margin-top', '54px', 'important')

    disablePickerMode(state)

    expect(document.documentElement.style.marginTop).toBe('')
  })

  it('leaves the page margin alone when it never changed it', () => {
    document.documentElement.style.marginTop = '9px'

    disablePickerMode(state)

    expect(document.documentElement.style.marginTop).toBe('9px')
  })

  it('does nothing when picker mode is already off', () => {
    disablePickerMode(state)
    bannerMocks.unmountPickerBanner.mockClear()

    disablePickerMode(state)

    expect(bannerMocks.unmountPickerBanner).not.toHaveBeenCalled()
  })
})
