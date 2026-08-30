import { setupCommandsListener } from '@/entrypoints/background/listeners/commands'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

describe('setupCommandsListener', () => {
  let setOptions: MockInstance
  let sendMessage: MockInstance
  let runCommand: (command: string) => Promise<void>
  let query: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    setOptions = spyOnBrowser(fakeBrowser.sidePanel, 'setOptions').mockResolvedValue(undefined)
    sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined as never,
    )
    query = spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue([])
    // fake-browser has no in-memory commands implementation, so capture the
    // registered handler and invoke it directly.
    spyOnBrowser(fakeBrowser.commands.onCommand, 'addListener').mockImplementation((listener) => {
      runCommand = listener as typeof runCommand
    })
    setupCommandsListener()
  })

  /** Stand in for the single active tab in the current window. */
  const withActiveTab = (tab: Partial<Browser.tabs.Tab>) =>
    query.mockResolvedValue([tab as Browser.tabs.Tab])

  it('enables the side panel and toggles the picker in the active tab', async () => {
    withActiveTab({ id: 1, url: 'https://example.com' })

    await runCommand('toggle_visual_picker')

    expect(setOptions).toHaveBeenCalledWith({ tabId: 1, path: 'sidepanel.html', enabled: true })
    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
      payload: { source: 'keyboard_shortcut' },
    })
  })

  it('ignores commands it does not own', async () => {
    withActiveTab({ id: 1, url: 'https://example.com' })

    await runCommand('some_other_command')

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does nothing when there is no active tab', async () => {
    await runCommand('toggle_visual_picker')

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does nothing when the active tab cannot host a content script', async () => {
    withActiveTab({ id: 1, url: 'chrome://settings' })

    await runCommand('toggle_visual_picker')

    expect(setOptions).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('logs when the content script cannot be reached', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    withActiveTab({ id: 1, url: 'https://example.com' })
    const failure = new Error('Receiving end does not exist')
    sendMessage.mockRejectedValue(failure)

    await runCommand('toggle_visual_picker')

    expect(errorSpy).toHaveBeenCalledWith(
      'Error handling toggle_visual_picker command (global):',
      failure,
    )
  })

  it('logs when querying the active tab fails', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('tabs unavailable')
    query.mockRejectedValue(failure)

    await runCommand('toggle_visual_picker')

    expect(errorSpy).toHaveBeenCalledWith(
      'Error handling toggle_visual_picker command (global):',
      failure,
    )
  })
})
