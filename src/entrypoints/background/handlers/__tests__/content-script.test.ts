import { handleContentScriptMessage } from '@/entrypoints/background/handlers/content-script'
import type { Message, MessageResponse } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { spyOnBrowser } from '@@/tests/support/fake-browser'

const sheetsMocks = vi.hoisted(() => ({ handleExportToSheets: vi.fn() }))
vi.mock('@/entrypoints/background/handlers/sheets-export', () => sheetsMocks)

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const tabSender = (id: number, windowId?: number) =>
  ({
    tab: { id, ...(windowId === undefined ? {} : { windowId }) },
  }) as Browser.runtime.MessageSender

describe('handleContentScriptMessage', () => {
  let sendResponse: ReturnType<typeof vi.fn<(response?: MessageResponse) => void>>
  let openSidePanel: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    sendResponse = vi.fn()
    openSidePanel = spyOnBrowser(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined)
    sheetsMocks.handleExportToSheets.mockResolvedValue(undefined)
  })

  const dispatch = (message: Message, sender: Browser.runtime.MessageSender = tabSender(3)) =>
    handleContentScriptMessage(message, sender, sendResponse)

  it('refuses any message from a sender without a tab', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})

    await dispatch({ type: MESSAGE_TYPES.GET_MY_TAB_ID }, {})

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'No tab ID available' })
  })

  it('reports the sender tab id back to the content script', async () => {
    await dispatch({ type: MESSAGE_TYPES.GET_MY_TAB_ID })

    expect(sendResponse).toHaveBeenCalledWith({ success: true, tabId: 3 })
  })

  it('tracks an event forwarded from the content script', async () => {
    await dispatch({
      type: MESSAGE_TYPES.TRACK_EVENT,
      payload: { eventName: 'picker_mode_enable', properties: { source: 'shortcut' } },
    })

    expect(trackEvent).toHaveBeenCalledWith('picker_mode_enable', { source: 'shortcut' })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('rejects a tracking message with no event name', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {})

    await dispatch({ type: MESSAGE_TYPES.TRACK_EVENT, payload: { properties: {} } })

    expect(trackEvent).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid event name' })
  })

  it('reports debug mode as enabled when the flag is set', async () => {
    await storage.setItem('local:debugMode', true)

    await dispatch({ type: MESSAGE_TYPES.GET_DEBUG_MODE })

    expect(sendResponse).toHaveBeenCalledWith({ success: true, debugMode: true })
  })

  it('reports debug mode as disabled when the flag is absent', async () => {
    await dispatch({ type: MESSAGE_TYPES.GET_DEBUG_MODE })

    expect(sendResponse).toHaveBeenCalledWith({ success: true, debugMode: false })
  })

  it('opens the side panel for the sender tab and window', async () => {
    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL }, tabSender(3, 8))

    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 3, windowId: 8 })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('omits the window id when the sender tab has none', async () => {
    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })

    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 3 })
  })

  it('reports the failure when the side panel cannot be opened', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    openSidePanel.mockRejectedValue(new Error('no user gesture'))

    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'no user gesture' })
  })

  it('delegates the Sheets export, tagging the log prefix as content script', async () => {
    const payload = { filename: 'Export', scrapedData: [] }

    await dispatch({ type: MESSAGE_TYPES.EXPORT_TO_SHEETS, payload })

    expect(sheetsMocks.handleExportToSheets).toHaveBeenCalledWith(payload, sendResponse, '🔵')
  })

  it('warns about message types it does not handle', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

    await dispatch({ type: 'no-such-type' })

    expect(warnSpy).toHaveBeenCalledWith(
      'Unhandled content script message type for tab 3: no-such-type',
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      warning: 'Unhandled message type',
    })
  })

  it('reports the error when a handler throws', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    sheetsMocks.handleExportToSheets.mockRejectedValue(new Error('export blew up'))

    await dispatch({ type: MESSAGE_TYPES.EXPORT_TO_SHEETS, payload: {} })

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'export blew up' })
  })
})
