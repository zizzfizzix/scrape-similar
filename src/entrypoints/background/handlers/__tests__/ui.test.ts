import { handleUiMessage } from '@/entrypoints/background/handlers/ui'
import type { Message, MessageResponse } from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const sheetsMocks = vi.hoisted(() => ({ handleExportToSheets: vi.fn() }))
vi.mock('@/entrypoints/background/handlers/sheets-export', () => sheetsMocks)

const demoMocks = vi.hoisted(() => ({ handleDemoScrape: vi.fn() }))
vi.mock('@/entrypoints/background/services/demo-scrape', () => demoMocks)

describe('handleUiMessage', () => {
  let sendResponse: ReturnType<typeof vi.fn<(response?: MessageResponse) => void>>
  let openSidePanel: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    sendResponse = vi.fn()
    openSidePanel = spyOnBrowser(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined)
    sheetsMocks.handleExportToSheets.mockResolvedValue(undefined)
    demoMocks.handleDemoScrape.mockResolvedValue(undefined)
  })

  const dispatch = (message: Message, sender: Browser.runtime.MessageSender = {}) =>
    handleUiMessage(message, sender, sendResponse)

  it('opens the side panel for the sender tab and window', async () => {
    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL }, { tab: { id: 4, windowId: 9 } } as never)

    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 4, windowId: 9 })
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('opens the side panel for the active tab when the sender has none', async () => {
    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })

    expect(openSidePanel).toHaveBeenCalledWith({})
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('omits the window id when the sender tab has none', async () => {
    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL }, { tab: { id: 4 } } as never)

    expect(openSidePanel).toHaveBeenCalledWith({ tabId: 4 })
  })

  it('reports the failure when the side panel cannot be opened', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    openSidePanel.mockRejectedValue(new Error('no user gesture'))

    await dispatch({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'no user gesture' })
  })

  it('delegates the Sheets export, tagging the log prefix as UI', async () => {
    const payload = { filename: 'Export', scrapedData: [] }

    await dispatch({ type: MESSAGE_TYPES.EXPORT_TO_SHEETS, payload })

    expect(sheetsMocks.handleExportToSheets).toHaveBeenCalledWith(payload, sendResponse, '🟡')
  })

  it('delegates the onboarding demo scrape', async () => {
    const sender = { tab: { id: 4 } } as Browser.runtime.MessageSender

    await dispatch({ type: MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE }, sender)

    expect(demoMocks.handleDemoScrape).toHaveBeenCalledWith(sender, sendResponse)
  })

  it('warns about message types it does not handle', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

    await dispatch({ type: 'no-such-type' })

    expect(warnSpy).toHaveBeenCalledWith('Unhandled UI message type: no-such-type')
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
