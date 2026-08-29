// @vitest-environment jsdom
import { createState, type ContentScriptState } from '@/entrypoints/content/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

/**
 * The handler closures `enablePickerMode` registers are thin adapters: each
 * forwards to a collaborator with the picker's own state and callbacks bound
 * in. Standing the collaborators in lets this file assert the wiring — which
 * handler reaches which function, with what — without re-testing behaviour that
 * `picker.test.ts` and `picker-context-menu.test.ts` already cover.
 */
const contextMenuMocks = vi.hoisted(() => ({
  handleLevelChange: vi.fn(),
  handlePickerContextMenu: vi.fn(),
  handlePickerContextMenuClickOutside: vi.fn(),
  removePickerContextMenu: vi.fn(),
  showPickerContextMenu: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/entrypoints/content/picker/context-menu', () => contextMenuMocks)

const bannerMocks = vi.hoisted(() => ({
  mountPickerBanner: vi.fn(),
  unmountPickerBanner: vi.fn(),
  updatePickerBannerContent: vi.fn(),
  getPickerBannerElement: vi.fn(() => null),
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

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const { disablePickerMode, enablePickerMode } = await import('@/entrypoints/content/picker')

const ctx = {} as ContentScriptContext
let state: ContentScriptState
const disable = vi.fn()

const handlers = () => state.pickerEventHandlers!

beforeEach(async () => {
  fakeBrowser.reset()
  document.head.innerHTML = ''
  document.body.innerHTML = '<ul><li id="target">a</li><li>b</li></ul>'
  document.documentElement.className = ''
  // jsdom has no layout engine, so hit testing is not implemented.
  document.elementFromPoint = vi.fn(() => null) as typeof document.elementFromPoint
  state = createState()
  bannerMocks.mountPickerBanner.mockResolvedValue(undefined)
  await enablePickerMode(ctx, state, disable)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('the registered picker handlers', () => {
  it('records the pointer position on a mouse move', () => {
    handlers().mouseMoveHandler(new MouseEvent('mousemove', { clientX: 64, clientY: 128 }))

    expect(state.lastMouseX).toBe(64)
    expect(state.lastMouseY).toBe(128)
  })

  it('turns picker mode off on Escape', () => {
    handlers().keyDownHandler(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(disable).toHaveBeenCalledWith('escape')
  })

  it('routes a click through the picker selection', () => {
    const target = document.querySelector('#target')!
    const event = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(event, 'target', { value: target })

    // No tab id yet, so the click stops before it can store anything.
    expect(() => handlers().clickHandler(event)).not.toThrow()
  })

  it('opens the context menu on a right click', () => {
    const event = new MouseEvent('contextmenu')

    handlers().contextMenuHandler(event)

    expect(contextMenuMocks.handlePickerContextMenu).toHaveBeenCalledWith(
      event,
      state,
      expect.any(Function),
    )
  })

  it('closes the context menu on a click outside it', () => {
    const event = new MouseEvent('mousedown')

    handlers().clickOutsideHandler(event)

    expect(contextMenuMocks.handlePickerContextMenuClickOutside).toHaveBeenCalledWith(
      event,
      state,
      expect.any(Function),
    )
  })

  it('re-offsets the page on a resize', () => {
    bannerMocks.updateBodyMarginForBanner.mockClear()

    handlers().resizeHandler()

    expect(bannerMocks.updateBodyMarginForBanner).toHaveBeenCalledWith(state)
  })
})

describe('the callbacks the context menu is given', () => {
  /** Right-click, then run the "show" callback the picker handed over. */
  const showContextMenu = async () => {
    handlers().contextMenuHandler(new MouseEvent('contextmenu'))
    const [, , show] = contextMenuMocks.handlePickerContextMenu.mock.calls.at(-1)!
    await (show as (x: number, y: number) => Promise<void>)(12, 34)
    return contextMenuMocks.showPickerContextMenu.mock.calls.at(-1)!
  }

  it('shows the menu at the pointer with the picker’s own dependencies', async () => {
    const [x, y, passedCtx, passedState] = await showContextMenu()

    expect([x, y, passedCtx, passedState]).toEqual([12, 34, ctx, state])
  })

  it('updates the banner when the level changes', async () => {
    const [, , , , onLevelChange] = await showContextMenu()

    ;(onLevelChange as (level: number, method?: string) => void)(1, 'slider')

    expect(contextMenuMocks.handleLevelChange).toHaveBeenCalledWith(
      1,
      state,
      expect.any(Function),
      'slider',
    )

    // The reporter it passes writes straight to the banner.
    const [, , report] = contextMenuMocks.handleLevelChange.mock.calls.at(-1)!
    ;(report as (matches: number, xpath: string) => void)(3, '//li')
    expect(bannerMocks.updatePickerBannerContent).toHaveBeenCalledWith(3, '//li', state)
  })

  it('tears the menu down when it asks to close', async () => {
    contextMenuMocks.removePickerContextMenu.mockClear()
    const [, , , , , onClose] = await showContextMenu()

    ;(onClose as () => void)()

    expect(contextMenuMocks.removePickerContextMenu).toHaveBeenCalledWith(
      state,
      expect.any(Function),
      expect.any(Function),
    )
  })
})

describe('disablePickerMode without registered handlers', () => {
  it('tears the rest down when there is nothing to unregister', () => {
    state.pickerEventHandlers = null

    expect(() => disablePickerMode(state, 'test')).not.toThrow()
    expect(state.pickerModeActive).toBe(false)
  })
})
