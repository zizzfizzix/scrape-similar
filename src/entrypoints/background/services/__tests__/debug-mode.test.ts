import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

// `isDevOrTest` is a build-time constant, so both production and dev/test
// branches are only reachable behind a mutable mock.
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

const { broadcastDebugMode, initializeDebugMode } =
  await import('@/entrypoints/background/services/debug-mode')

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('broadcastDebugMode', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    modeFlags.isDev = false
    modeFlags.isTest = false
    modeFlags.isDevOrTest = false
  })

  it('messages every tab that has an id', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com/a' })
    await fakeBrowser.tabs.create({ url: 'https://example.com/b' })
    const sendMessage = vi
      .spyOn(fakeBrowser.tabs, 'sendMessage')
      .mockResolvedValue(undefined as never)

    await broadcastDebugMode(true)

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.DEBUG_MODE_CHANGED,
      payload: { debugMode: true },
    })
  })

  it('ignores tabs without a listener', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockRejectedValue(
      new Error('Receiving end does not exist'),
    )

    await expect(broadcastDebugMode(false)).resolves.toBeUndefined()
  })

  it('logs a warning when the tab query itself fails', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('tabs unavailable')
    spyOnBrowser(fakeBrowser.tabs, 'query').mockRejectedValue(failure)

    await expect(broadcastDebugMode(true)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith('Error broadcasting debugMode change:', failure)
  })
})

describe('initializeDebugMode', () => {
  let sendMessage: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    modeFlags.isDev = false
    modeFlags.isTest = false
    modeFlags.isDevOrTest = false
    sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined as never,
    )
  })

  it('always logs at trace level in dev or test builds', async () => {
    modeFlags.isDevOrTest = true
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
    await storage.setItem('local:debugMode', false)

    await initializeDebugMode()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('reads the stored flag in production builds', async () => {
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})
    await storage.setItem('local:debugMode', true)

    await initializeDebugMode()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('logs errors only in production builds with debug mode off', async () => {
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await initializeDebugMode()

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('updates the log level and broadcasts when the flag changes in production', async () => {
    await initializeDebugMode()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await storage.setItem('local:debugMode', true)
    await flushWatchers()

    expect(setLevel).toHaveBeenCalledWith('trace')
    expect(sendMessage).not.toHaveBeenCalled() // no tabs open
  })

  it('resets the log level when the flag is turned back off', async () => {
    await storage.setItem('local:debugMode', true)
    await initializeDebugMode()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await storage.setItem('local:debugMode', false)
    await flushWatchers()

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('broadcasts but does not touch the log level in dev or test builds', async () => {
    modeFlags.isDevOrTest = true
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    await initializeDebugMode()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await storage.setItem('local:debugMode', true)
    await flushWatchers()

    expect(setLevel).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.DEBUG_MODE_CHANGED,
      payload: { debugMode: true },
    })
  })

  it('broadcasts false when the flag is removed entirely', async () => {
    await storage.setItem('local:debugMode', true)
    await fakeBrowser.tabs.create({ url: 'https://example.com' })
    await initializeDebugMode()

    await storage.removeItem('local:debugMode')
    await flushWatchers()

    expect(sendMessage).toHaveBeenCalledWith(1, {
      type: MESSAGE_TYPES.DEBUG_MODE_CHANGED,
      payload: { debugMode: false },
    })
  })
})
