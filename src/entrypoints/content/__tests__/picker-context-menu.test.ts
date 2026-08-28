// @vitest-environment jsdom
import {
  handleLevelChange,
  handlePickerContextMenu,
  handlePickerContextMenuClickOutside,
  handlePickerContextMenuWheel,
  removePickerContextMenu,
} from '@/entrypoints/content/picker/context-menu'
import {
  createState,
  type ContentScriptState,
  type PickerContextMenuApi,
} from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const highlightMocks = vi.hoisted(() => ({ highlightElementsForPicker: vi.fn() }))
vi.mock('@/entrypoints/content/highlight', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entrypoints/content/highlight')>()),
  highlightElementsForPicker: highlightMocks.highlightElementsForPicker,
}))

const createMenuApi = (): PickerContextMenuApi => ({
  unmount: vi.fn(),
  updateLevel: vi.fn(),
  updateLevels: vi.fn(),
  updatePosition: vi.fn(),
})

let state: ContentScriptState

beforeEach(() => {
  document.body.innerHTML = '<ul><li>a</li><li>b</li></ul><div id="single">x</div>'
  state = createState()
})

describe('handleLevelChange', () => {
  let onUpdate: ReturnType<typeof vi.fn<(matches: number, xpath: string) => void>>

  beforeEach(() => {
    onUpdate = vi.fn<(matches: number, xpath: string) => void>()
    state.selectorCandidates = ['//div[@id="single"]', '//li', '//ul']
    state.selectedCandidateIndex = 0
    state.currentXPath = '//div[@id="single"]'
  })

  it('re-highlights and reports the new level’s matches', () => {
    handleLevelChange(1, state, onUpdate, 'slider')

    expect(state.selectedCandidateIndex).toBe(1)
    expect(state.currentXPath).toBe('//li')
    expect(highlightMocks.highlightElementsForPicker).toHaveBeenCalledWith(
      [...document.querySelectorAll('li')],
      state.highlightedElements,
    )
    expect(onUpdate).toHaveBeenCalledWith(2, '//li')
  })

  it('tracks the change with the method that caused it', () => {
    handleLevelChange(1, state, onUpdate, 'keyboard')

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_LEVEL_CHANGE, {
      from_level: 0,
      to_level: 1,
      method: 'keyboard',
    })
  })

  it('records an unknown method when none is given', () => {
    handleLevelChange(1, state, onUpdate)

    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PICKER_LEVEL_CHANGE,
      expect.objectContaining({ method: 'unknown' }),
    )
  })

  it('ignores a level that is already selected', () => {
    handleLevelChange(0, state, onUpdate)

    expect(onUpdate).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('ignores a level beyond the candidate list', () => {
    handleLevelChange(9, state, onUpdate)

    expect(state.selectedCandidateIndex).toBe(0)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('ignores a negative level', () => {
    handleLevelChange(-1, state, onUpdate)

    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('handlePickerContextMenuWheel', () => {
  let onLevelChange: ReturnType<typeof vi.fn<(level: number, method?: string) => void>>
  let api: PickerContextMenuApi

  const wheel = (deltaY: number) => {
    const event = { deltaY, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    handlePickerContextMenuWheel(event as unknown as WheelEvent, state, onLevelChange)
    return event
  }

  beforeEach(() => {
    onLevelChange = vi.fn<(level: number, method?: string) => void>()
    api = createMenuApi()
    state.pickerContextMenuApi = api
    state.selectorCandidates = ['a', 'b', 'c', 'd']
    state.selectedCandidateIndex = 1
  })

  it('always suppresses the page scroll', () => {
    const event = wheel(1)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  it('does nothing when the menu is not mounted', () => {
    state.pickerContextMenuApi = null

    wheel(100)

    expect(onLevelChange).not.toHaveBeenCalled()
  })

  it('does nothing when there is only one candidate', () => {
    state.selectorCandidates = ['a']
    state.selectedCandidateIndex = 0

    wheel(100)

    expect(onLevelChange).not.toHaveBeenCalled()
  })

  it('does nothing when there are no candidates at all', () => {
    state.selectorCandidates = []

    wheel(100)

    expect(onLevelChange).not.toHaveBeenCalled()
  })

  it('accumulates small scrolls without changing level', () => {
    wheel(10)
    wheel(10)

    expect(onLevelChange).not.toHaveBeenCalled()
    expect(state.pickerScrollAccumulator).toBe(20)
  })

  it('narrows the selection when scrolling down past the threshold', () => {
    wheel(40)

    expect(onLevelChange).toHaveBeenCalledWith(0, 'scroll')
    expect(api.updateLevel).toHaveBeenCalledWith(0)
  })

  it('broadens the selection when scrolling up past the threshold', () => {
    wheel(-40)

    expect(onLevelChange).toHaveBeenCalledWith(2, 'scroll')
  })

  it('moves several levels for a large scroll', () => {
    state.selectedCandidateIndex = 3

    wheel(-40)
    expect(onLevelChange).not.toHaveBeenCalled() // already at the broadest level

    onLevelChange.mockClear()
    wheel(120)
    expect(onLevelChange).toHaveBeenCalledWith(0, 'scroll')
  })

  it('keeps the remainder after a level change', () => {
    wheel(50)

    expect(state.pickerScrollAccumulator).toBe(12)
  })

  it('clamps at the most specific level', () => {
    state.selectedCandidateIndex = 0

    wheel(400)

    expect(onLevelChange).not.toHaveBeenCalled()
  })

  it('clamps at the broadest level', () => {
    state.selectedCandidateIndex = 3

    wheel(-400)

    expect(onLevelChange).not.toHaveBeenCalled()
  })
})

describe('removePickerContextMenu', () => {
  let removeCrosshairCursor: ReturnType<typeof vi.fn<() => void>>
  let applyCrosshairCursor: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    removeCrosshairCursor = vi.fn<() => void>()
    applyCrosshairCursor = vi.fn<() => void>()
  })

  it('tears down the mounted menu and clears its state', () => {
    const remove = vi.fn()
    state.pickerContextMenuUi = { mount: vi.fn(), remove }
    state.pickerContextMenuHost = document.createElement('div')
    state.pickerContextMenuApi = createMenuApi()
    state.pickerContextMenuOpen = true

    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

    expect(remove).toHaveBeenCalled()
    expect(state.pickerContextMenuUi).toBeNull()
    expect(state.pickerContextMenuHost).toBeNull()
    expect(state.pickerContextMenuApi).toBeNull()
    expect(state.pickerContextMenuOpen).toBe(false)
  })

  it('unsubscribes the wheel handler', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener')
    const handler = vi.fn()
    state.contextMenuWheelHandler = handler

    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

    expect(removeEventListener).toHaveBeenCalledWith('wheel', handler)
  })

  it('does not try to unsubscribe when no handler was registered', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

    expect(removeEventListener).not.toHaveBeenCalledWith('wheel', expect.anything())
  })

  it('swallows a failure to remove the shadow UI', () => {
    state.pickerContextMenuUi = {
      mount: vi.fn(),
      remove: vi.fn(() => {
        throw new Error('already detached')
      }),
    }

    expect(() =>
      removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor),
    ).not.toThrow()
    expect(state.pickerContextMenuUi).toBeNull()
  })

  it('restores the crosshair while picker mode is still on', () => {
    state.pickerModeActive = true

    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

    expect(applyCrosshairCursor).toHaveBeenCalled()
  })

  it('leaves the cursor alone once picker mode is off', () => {
    removePickerContextMenu(state, removeCrosshairCursor, applyCrosshairCursor)

    expect(applyCrosshairCursor).not.toHaveBeenCalled()
  })
})

describe('handlePickerContextMenu', () => {
  let showContextMenu: ReturnType<typeof vi.fn<(x: number, y: number) => Promise<void>>>

  const rightClick = (path: EventTarget[]) => {
    const event = {
      clientX: 120,
      clientY: 240,
      composedPath: () => path,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    handlePickerContextMenu(event as unknown as MouseEvent, state, showContextMenu)
    return event
  }

  beforeEach(() => {
    showContextMenu = vi.fn<(x: number, y: number) => Promise<void>>().mockResolvedValue(undefined)
    state.pickerModeActive = true
  })

  it('opens the picker menu at the pointer', () => {
    const target = document.querySelector('li')!

    const event = rightClick([target])

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(showContextMenu).toHaveBeenCalledWith(120, 240)
  })

  it('does nothing while picker mode is off', () => {
    state.pickerModeActive = false

    rightClick([document.querySelector('li')!])

    expect(showContextMenu).not.toHaveBeenCalled()
  })

  it('leaves the native menu alone on the banner', () => {
    const banner = document.createElement('div')
    state.bannerRootEl = banner as HTMLDivElement

    const event = rightClick([banner])

    expect(showContextMenu).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves the native menu alone on the picker menu itself', () => {
    const host = document.createElement('div')
    state.pickerContextMenuHost = host as HTMLDivElement

    rightClick([host])

    expect(showContextMenu).not.toHaveBeenCalled()
  })

  it('leaves the native menu alone on any extension shadow host', () => {
    const host = document.createElement('div')
    host.setAttribute('data-wxt-shadow-root', '')

    rightClick([host])

    expect(showContextMenu).not.toHaveBeenCalled()
  })

  it('ignores non-element entries in the event path', () => {
    rightClick([window, document, document.querySelector('li')!])

    expect(showContextMenu).toHaveBeenCalled()
  })

  it('still opens when the banner exists but was not clicked', () => {
    state.bannerRootEl = document.createElement('div') as HTMLDivElement
    state.pickerContextMenuHost = document.createElement('div') as HTMLDivElement

    rightClick([document.querySelector('li')!])

    expect(showContextMenu).toHaveBeenCalled()
  })
})

describe('handlePickerContextMenuClickOutside', () => {
  let removeContextMenu: ReturnType<typeof vi.fn<() => void>>

  const click = (path: EventTarget[]) =>
    handlePickerContextMenuClickOutside(
      { composedPath: () => path } as unknown as MouseEvent,
      state,
      removeContextMenu,
    )

  beforeEach(() => {
    removeContextMenu = vi.fn<() => void>()
    state.pickerContextMenuHost = document.createElement('div') as HTMLDivElement
    state.pickerContextMenuOpen = true
  })

  it('closes the menu on a click elsewhere', () => {
    click([document.querySelector('li')!])

    expect(removeContextMenu).toHaveBeenCalled()
  })

  it('keeps the menu open on a click inside it', () => {
    click([state.pickerContextMenuHost!])

    expect(removeContextMenu).not.toHaveBeenCalled()
  })

  it('does nothing when the menu is already closed', () => {
    state.pickerContextMenuOpen = false

    click([document.querySelector('li')!])

    expect(removeContextMenu).not.toHaveBeenCalled()
  })

  it('does nothing when the menu was never mounted', () => {
    state.pickerContextMenuHost = null

    click([document.querySelector('li')!])

    expect(removeContextMenu).not.toHaveBeenCalled()
  })
})
