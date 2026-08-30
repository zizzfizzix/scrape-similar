import { setupActionListener } from '@/entrypoints/background/listeners/action'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const sessionMocks = vi.hoisted(() => ({ initializeSessionState: vi.fn() }))
vi.mock('@/entrypoints/background/services/session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entrypoints/background/services/session-storage')>()),
  initializeSessionState: sessionMocks.initializeSessionState,
}))

describe('setupActionListener', () => {
  let setOptions: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    setOptions = spyOnBrowser(fakeBrowser.sidePanel, 'setOptions').mockResolvedValue(undefined)
    sessionMocks.initializeSessionState.mockResolvedValue(undefined)
    setupActionListener()
  })

  const click = (tab: Partial<Browser.tabs.Tab>) =>
    fakeBrowser.action.onClicked.trigger(tab as Browser.tabs.Tab)

  it('enables the side panel, tracks the open and seeds session state', async () => {
    await click({ id: 5 })

    expect(setOptions).toHaveBeenCalledWith({ tabId: 5, path: 'sidepanel.html', enabled: true })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIDE_PANEL_OPEN, {
      trigger: 'action_click',
    })
    expect(sessionMocks.initializeSessionState).toHaveBeenCalledWith(5)
  })

  it('ignores clicks on a tab with no id', async () => {
    await click({})

    expect(setOptions).not.toHaveBeenCalled()
  })

  it('ignores a missing tab entirely', async () => {
    await fakeBrowser.action.onClicked.trigger(undefined as unknown as Browser.tabs.Tab)

    expect(setOptions).not.toHaveBeenCalled()
  })

  it('logs but does not rethrow when seeding session state fails', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('session unavailable')
    sessionMocks.initializeSessionState.mockRejectedValue(failure)

    await click({ id: 5 })

    expect(errorSpy).toHaveBeenCalledWith(
      '[ActionClick] Error ensuring session state for tab 5:',
      failure,
    )
  })

  it('logs and stops when the side panel cannot be configured', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('no such tab')
    setOptions.mockRejectedValue(failure)

    await click({ id: 5 })

    expect(errorSpy).toHaveBeenCalledWith('Error handling action click for tab 5:', failure)
    expect(sessionMocks.initializeSessionState).not.toHaveBeenCalled()
  })
})
