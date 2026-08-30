// @vitest-environment jsdom
import {
  applyDebugMode,
  requestTabId,
  startContentScript,
  trackContextMenuTarget,
} from '@/entrypoints/content/bootstrap'
import { createState } from '@/entrypoints/content/state'
import { MESSAGE_TYPES, type Message, type MessageResponse } from '@/utils/types'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

// `isDevOrTest` is a build-time constant; the debug flag is only consulted in
// production builds, so it needs a mutable mock to be reachable.
const modeFlags = { isDev: false, isTest: false, isDevOrTest: false }
vi.mock('@/utils/modeTest', () => ({
  get isDev() {
    return modeFlags.isDev
  },
  get isTest() {
    return modeFlags.isTest
  },
  get isDevOrTest() {
    return modeFlags.isDevOrTest
  },
}))

const pickerMocks = vi.hoisted(() => ({
  enablePickerMode: vi.fn(),
  disablePickerMode: vi.fn(),
}))
vi.mock('@/entrypoints/content/picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entrypoints/content/picker')>()),
  ...pickerMocks,
}))

const ctx = {} as ContentScriptContext

/** Deliver a message to every registered `runtime.onMessage` listener. */
/**
 * `trigger` resolves as soon as every listener has been called, handing back
 * what each returned — so an async listener is still running inside the array
 * it resolves to. Settling those too is what makes `await broadcast(...)` mean
 * "the content script has finished answering".
 */
const broadcast = async (message: Message, sendResponse: (response: unknown) => void = () => {}) =>
  Promise.all(await fakeBrowser.runtime.onMessage.trigger(message, {}, sendResponse))

/** Answer `browser.runtime.sendMessage` per message type. */
const backgroundReplies = (replies: Record<string, MessageResponse | undefined>) =>
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
    (message: Message, callback?: (response: MessageResponse | undefined) => void) => {
      const reply = replies[message.type]
      callback?.(reply)
      return Promise.resolve(reply)
    },
  )

let setLevel: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fakeBrowser.reset()
  modeFlags.isDevOrTest = false
  document.body.innerHTML = ''
  setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
})

describe('applyDebugMode', () => {
  it('always logs at trace level in dev or test builds', () => {
    modeFlags.isDevOrTest = true
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage')

    applyDebugMode()

    expect(setLevel).toHaveBeenCalledWith('trace')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('asks the background for the flag, since it cannot read storage itself', () => {
    const sendMessage = backgroundReplies({
      [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: true },
    })

    applyDebugMode()

    expect(sendMessage).toHaveBeenCalledWith(
      { type: MESSAGE_TYPES.GET_DEBUG_MODE },
      expect.any(Function),
    )
    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('logs only errors when the flag is off', () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: false } })

    applyDebugMode()

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('leaves the level alone when the background refuses to say', () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: false, error: 'nope' } })

    applyDebugMode()

    expect(setLevel).not.toHaveBeenCalled()
  })

  it('leaves the level alone when the answer holds no flag', () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true } })

    applyDebugMode()

    expect(setLevel).not.toHaveBeenCalled()
  })

  it('leaves the level alone when the flag is not a boolean', () => {
    backgroundReplies({
      [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: 'yes' } as never,
    })

    applyDebugMode()

    expect(setLevel).not.toHaveBeenCalled()
  })

  it('follows a later broadcast of the flag', async () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: false } })
    applyDebugMode()
    setLevel.mockClear()

    await broadcast({ type: MESSAGE_TYPES.DEBUG_MODE_CHANGED, payload: { debugMode: true } })

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('treats a broadcast with no payload as the flag being off', async () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: true } })
    applyDebugMode()
    setLevel.mockClear()

    await broadcast({ type: MESSAGE_TYPES.DEBUG_MODE_CHANGED })

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('ignores messages about anything else', async () => {
    backgroundReplies({ [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: false } })
    applyDebugMode()
    setLevel.mockClear()

    await broadcast({ type: MESSAGE_TYPES.GET_DEBUG_MODE })

    expect(setLevel).not.toHaveBeenCalled()
  })
})

describe('requestTabId', () => {
  it('records the tab it was told it runs in', () => {
    backgroundReplies({ GET_MY_TAB_ID: { success: true, tabId: 12 } })
    const state = createState()

    requestTabId(state)

    expect(state.tabId).toBe(12)
  })

  it('refuses to run without a tab id', () => {
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: Message, callback?: (response: MessageResponse) => void) => {
        setLastError({ message: 'Receiving end does not exist' })
        expect(() => callback?.({ success: false, error: 'no tab' })).toThrow(
          'Content script cannot function without tabId.',
        )
        setLastError(undefined)
        return Promise.resolve(undefined)
      },
    )

    requestTabId(createState())
  })

  it('refuses an answer carrying no tab id', () => {
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: Message, callback?: (response: MessageResponse) => void) => {
        expect(() => callback?.({ success: true })).toThrow(
          'Content script cannot function without tabId.',
        )
        return Promise.resolve(undefined)
      },
    )

    requestTabId(createState())
  })

  it('refuses a tab id that is not a number', () => {
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      (_message: Message, callback?: (response: MessageResponse) => void) => {
        expect(() => callback?.({ success: true, tabId: '3' } as never)).toThrow(
          'Content script cannot function without tabId.',
        )
        return Promise.resolve(undefined)
      },
    )

    requestTabId(createState())
  })
})

/** A right-click event already carrying its target, as dispatch would set it. */
const contextMenuOn = (target: Element | null, clientX: number, clientY: number): MouseEvent => {
  const event = new MouseEvent('contextmenu', { clientX, clientY })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('trackContextMenuTarget', () => {
  it('remembers where the click landed, for the picker to open at', () => {
    const state = createState()
    const target = document.createElement('td')
    document.body.append(target)

    trackContextMenuTarget(state, contextMenuOn(target, 40, 90))

    expect(state.lastMouseX).toBe(40)
    expect(state.lastMouseY).toBe(90)
  })

  it('records the xpath, text and markup of the target', () => {
    const target = document.createElement('td')
    target.textContent = 'Poland'
    document.body.append(target)
    const state = createState()

    trackContextMenuTarget(state, contextMenuOn(target, 1, 2))

    expect(state.lastRightClickedElement).toBe(target)
    expect(state.lastRightClickedElementDetails).toEqual({
      xpath: expect.stringContaining('td'),
      text: 'Poland',
      html: '<td>Poland</td>',
    })
  })

  it('keeps no details when the event names no element', () => {
    const state = createState()

    trackContextMenuTarget(state, contextMenuOn(null, 5, 6))

    expect(state.lastRightClickedElementDetails).toBeNull()
    expect(state.lastMouseX).toBe(5)
  })
})

describe('startContentScript', () => {
  beforeEach(() => {
    backgroundReplies({
      [MESSAGE_TYPES.GET_DEBUG_MODE]: { success: true, debugMode: false },
      [MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA]: { success: true },
      GET_MY_TAB_ID: { success: true, tabId: 7 },
    })
  })

  it('starts on the tab it was told about', () => {
    const state = startContentScript(ctx)

    expect(state.tabId).toBe(7)
  })

  it('watches for right-clicks on the page', () => {
    const target = document.createElement('span')
    target.textContent = 'Warsaw'
    document.body.append(target)

    const state = startContentScript(ctx)
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 3, clientY: 4 }))

    expect(state.lastRightClickedElement).toBe(target)
    expect(state.lastMouseX).toBe(3)
  })

  it('answers messages addressed to the content script', async () => {
    document.body.innerHTML = '<table><tr><td>Poland</td></tr></table>'
    startContentScript(ctx)
    const sendResponse = vi.fn()

    await broadcast(
      {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: { mainSelector: '//td', columns: [{ name: 'Name', selector: '.' }] },
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          data: [expect.objectContaining({ data: { Name: 'Poland' } })],
        }),
      }),
    )
  })

  it('opens and closes the picker on request', async () => {
    startContentScript(ctx)

    await broadcast({ type: MESSAGE_TYPES.ENABLE_PICKER_MODE })
    await broadcast({ type: MESSAGE_TYPES.DISABLE_PICKER_MODE })

    expect(pickerMocks.enablePickerMode).toHaveBeenCalledWith(
      ctx,
      expect.anything(),
      expect.any(Function),
      undefined,
    )
    expect(pickerMocks.disablePickerMode).toHaveBeenCalled()
  })
})
