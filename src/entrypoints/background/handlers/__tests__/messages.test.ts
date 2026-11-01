import { setupMessageListener } from '@/entrypoints/background/handlers/messages'
import { getSessionState } from '@/entrypoints/background/services/session-storage'
import type { Message, MessageResponse } from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

// Both dispatchers are started rather than awaited by the router, so their
// stubs have to resolve rather than return `undefined`.
const routeMocks = vi.hoisted(() => ({
  handleContentScriptMessage: vi.fn().mockResolvedValue(undefined),
  handleUiMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/entrypoints/background/handlers/content-script', () => ({
  handleContentScriptMessage: routeMocks.handleContentScriptMessage,
}))
vi.mock('@/entrypoints/background/handlers/ui', () => ({
  handleUiMessage: routeMocks.handleUiMessage,
}))

describe('setupMessageListener', () => {
  let receive: (
    message: Message,
    sender: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
  ) => unknown
  let sendResponse: ReturnType<typeof vi.fn<(response?: MessageResponse) => void>>

  beforeEach(() => {
    fakeBrowser.reset()
    sendResponse = vi.fn()
    spyOnBrowser(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation((listener) => {
      receive = listener as typeof receive
    })
    setupMessageListener()
  })

  const extensionUrl = (path: string) => fakeBrowser.runtime.getURL(`/${path}` as never)

  describe('UPDATE_SIDEPANEL_DATA', () => {
    const update = (payload: unknown, sender: Browser.runtime.MessageSender = {}) =>
      receive({ type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA, payload }, sender, sendResponse)

    it('applies the updates to the tab named in the payload', async () => {
      update({ tabId: 5, updates: { highlightMatchCount: 3 } })
      await flushMicrotasks()

      expect((await getSessionState(5))?.highlightMatchCount).toBe(3)
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('falls back to the sender tab when the payload omits the id', async () => {
      update({ updates: { highlightMatchCount: 7 } }, { tab: { id: 6 } } as never)
      await flushMicrotasks()

      expect((await getSessionState(6))?.highlightMatchCount).toBe(7)
    })

    it('prefers the explicit tab id over the sender tab', async () => {
      update({ tabId: 5, updates: { highlightMatchCount: 1 } }, { tab: { id: 6 } } as never)
      await flushMicrotasks()

      expect((await getSessionState(5))?.highlightMatchCount).toBe(1)
      expect(await getSessionState(6)).toBeNull()
    })

    it('rejects an update with no resolvable tab', async () => {
      update({ updates: { highlightMatchCount: 1 } })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId or sender.tab.id required',
      })
    })

    it('rejects an update with no updates object', async () => {
      update({ tabId: 5 })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId or sender.tab.id required',
      })
    })

    it('rejects a message with no payload at all', async () => {
      receive({ type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA }, {}, sendResponse)

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId or sender.tab.id required',
      })
    })

    it('reports the error when the write fails', async () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      const { storage } = await import('wxt/utils/storage')
      vi.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('quota exceeded'))

      update({ tabId: 5, updates: { highlightMatchCount: 1 } })
      await flushMicrotasks()

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'quota exceeded' })
    })

    it('never reaches the sender-based routers', async () => {
      update({ tabId: 5, updates: {} })
      await flushMicrotasks()

      expect(routeMocks.handleContentScriptMessage).not.toHaveBeenCalled()
      expect(routeMocks.handleUiMessage).not.toHaveBeenCalled()
    })
  })

  describe('routing by sender', () => {
    it('routes a web page tab to the content script handler', () => {
      const sender = { tab: { id: 3 }, url: 'https://example.com' } as Browser.runtime.MessageSender
      const message = { type: MESSAGE_TYPES.GET_MY_TAB_ID }

      receive(message, sender, sendResponse)

      expect(routeMocks.handleContentScriptMessage).toHaveBeenCalledWith(
        message,
        sender,
        sendResponse,
      )
      expect(routeMocks.handleUiMessage).not.toHaveBeenCalled()
    })

    it('routes an extension page with a tab to the UI handler', () => {
      const sender = {
        tab: { id: 3 },
        url: extensionUrl('onboarding.html'),
      } as Browser.runtime.MessageSender

      receive({ type: MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE }, sender, sendResponse)

      expect(routeMocks.handleUiMessage).toHaveBeenCalled()
      expect(routeMocks.handleContentScriptMessage).not.toHaveBeenCalled()
    })

    it('routes a sender with no tab to the UI handler', () => {
      receive(
        { type: MESSAGE_TYPES.OPEN_SIDEPANEL },
        { url: extensionUrl('sidepanel.html') } as never,
        sendResponse,
      )

      expect(routeMocks.handleUiMessage).toHaveBeenCalled()
    })

    it('routes a tab with no id to the UI handler', () => {
      receive(
        { type: MESSAGE_TYPES.OPEN_SIDEPANEL },
        { tab: {}, url: 'https://example.com' } as never,
        sendResponse,
      )

      expect(routeMocks.handleUiMessage).toHaveBeenCalled()
    })

    it('routes a sender with no url to the content script handler when it has a tab', () => {
      receive({ type: MESSAGE_TYPES.GET_MY_TAB_ID }, { tab: { id: 3 } } as never, sendResponse)

      expect(routeMocks.handleContentScriptMessage).toHaveBeenCalled()
    })

    it('always claims the async response channel', () => {
      const result = receive(
        { type: MESSAGE_TYPES.GET_MY_TAB_ID },
        { tab: { id: 3 }, url: 'https://example.com' } as never,
        sendResponse,
      )

      expect(result).toBe(true)
    })

    it('logs extra detail for a Sheets export, then routes it', () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {})
      const sender = { tab: { id: 3 }, url: 'https://example.com' } as Browser.runtime.MessageSender

      receive(
        { type: MESSAGE_TYPES.EXPORT_TO_SHEETS, payload: { filename: 'Export' } },
        sender,
        sendResponse,
      )

      expect(debugSpy).toHaveBeenCalledWith(
        '🔥 EXPORT_TO_SHEETS message received:',
        expect.objectContaining({ hasPayload: true, payloadKeys: ['filename'], senderTab: 3 }),
      )
      expect(routeMocks.handleContentScriptMessage).toHaveBeenCalled()
    })

    it('logs placeholders for a Sheets export with no payload, tab or url', () => {
      const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {})

      receive({ type: MESSAGE_TYPES.EXPORT_TO_SHEETS }, {}, sendResponse)

      expect(debugSpy).toHaveBeenCalledWith(
        '🔥 EXPORT_TO_SHEETS message received:',
        expect.objectContaining({
          hasPayload: false,
          payloadKeys: [],
          senderTab: 'no-tab',
          senderUrl: 'no-url',
        }),
      )
    })
  })
})
