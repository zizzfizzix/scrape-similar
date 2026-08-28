import { getSessionState } from '@/entrypoints/background/services/session-storage'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import type { MessageResponse, ScrapeConfig } from '@/utils/types'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { spyOnBrowser } from '@@/tests/support/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

// `isTest` is a build-time constant, so the demo config picks a different
// selector per build. Both branches need a mutable mock to be reachable.
const modeFlags = { isDev: false, isTest: true, isDevOrTest: true }
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

const { clearDemoScrapeFlag, executeDemoScrape, handleDemoScrape } =
  await import('@/entrypoints/background/services/demo-scrape')

const senderWithTab = (tabId: number) => ({ tab: { id: tabId } }) as Browser.runtime.MessageSender

const readPendingConfig = (tabId: number) =>
  storage.getItem<ScrapeConfig>(`local:demo_scrape_pending_${tabId}`)

describe('handleDemoScrape', () => {
  let sendResponse: ReturnType<typeof vi.fn<(response?: MessageResponse) => void>>

  beforeEach(() => {
    fakeBrowser.reset()
    modeFlags.isTest = true
    sendResponse = vi.fn()
  })

  it('stores the table demo config in test builds', async () => {
    await handleDemoScrape(senderWithTab(7), sendResponse)

    const stored = await readPendingConfig(7)
    expect(stored?.mainSelector).toContain('wikitable')
    expect(stored?.columns.map((column) => column.name)).toEqual([
      'Rank',
      'Country/Territory',
      'Population',
      'Percentage',
      'Date',
    ])
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('stores the anchor demo config in production builds', async () => {
    modeFlags.isTest = false

    await handleDemoScrape(senderWithTab(7), sendResponse)

    const stored = await readPendingConfig(7)
    expect(stored?.mainSelector).toBe('//a')
    expect(stored?.columns.map((column) => column.selector)).toEqual([
      '.',
      '@href',
      '@rel',
      '@target',
    ])
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('reports failure when the sender has no tab', async () => {
    await handleDemoScrape({} as Browser.runtime.MessageSender, sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'No tab ID available from sender',
    })
  })

  it('reports failure when the write to storage throws', async () => {
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('quota exceeded'))

    await handleDemoScrape(senderWithTab(7), sendResponse)

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'quota exceeded' })
  })
})

describe('executeDemoScrape', () => {
  const config: ScrapeConfig = {
    mainSelector: '//tr',
    columns: [{ name: 'Rank', selector: './td[1]' }],
  }
  let sendMessage: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage')
  })

  /** Reply to each content-script message type with a canned response. */
  const replyWith = (responses: Record<string, unknown>) => {
    sendMessage.mockImplementation((async (_tabId: number, message: { type: string }) => {
      if (!(message.type in responses)) throw new Error(`unexpected message ${message.type}`)
      const response = responses[message.type]
      if (response instanceof Error) throw response
      return response
    }) as never)
  }

  it('saves the config, highlights, scrapes and enables the picker', async () => {
    replyWith({
      [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 10 },
      [MESSAGE_TYPES.START_SCRAPE]: { success: true },
      [MESSAGE_TYPES.ENABLE_PICKER_MODE]: { success: true },
    })

    await executeDemoScrape(3, config)

    const state = await getSessionState(3)
    expect(state?.currentScrapeConfig).toEqual(config)
    expect(state?.highlightMatchCount).toBe(10)
    expect(sendMessage).toHaveBeenCalledWith(3, {
      type: MESSAGE_TYPES.ENABLE_PICKER_MODE,
      payload: { source: 'demo_scrape' },
    })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: true,
    })
  })

  it('records the highlight error and stops when nothing matched', async () => {
    replyWith({
      [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: {
        success: false,
        matchCount: 0,
        error: 'Invalid XPath',
      },
    })

    await executeDemoScrape(3, config)

    const state = await getSessionState(3)
    expect(state?.highlightError).toBe('Invalid XPath')
    expect(sendMessage).not.toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: MESSAGE_TYPES.START_SCRAPE }),
    )
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('stops when the highlight succeeds but matches nothing', async () => {
    replyWith({ [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 0 } })

    await executeDemoScrape(3, config)

    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('tracks a failed scrape with its error', async () => {
    replyWith({
      [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 4 },
      [MESSAGE_TYPES.START_SCRAPE]: { success: false, error: 'No rows' },
    })

    await executeDemoScrape(3, config)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: false,
      error: 'No rows',
    })
  })

  it('treats a missing scrape response as a failure', async () => {
    replyWith({
      [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 4 },
      [MESSAGE_TYPES.START_SCRAPE]: undefined,
    })

    await executeDemoScrape(3, config)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: false,
      error: undefined,
    })
  })

  it('still reports success when enabling the picker fails', async () => {
    replyWith({
      [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 4 },
      [MESSAGE_TYPES.START_SCRAPE]: { success: true },
      [MESSAGE_TYPES.ENABLE_PICKER_MODE]: new Error('picker unavailable'),
    })

    await executeDemoScrape(3, config)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: true,
    })
  })

  it('tracks the failure when the tab cannot be reached at all', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))

    await executeDemoScrape(3, config)

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_DEMO_SCRAPE, {
      success: false,
      error: 'Receiving end does not exist',
    })
  })
})

describe('clearDemoScrapeFlag', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('removes the pending config for the tab', async () => {
    await storage.setItem(`local:demo_scrape_pending_5`, { mainSelector: '//a', columns: [] })

    await clearDemoScrapeFlag(5)

    expect(await readPendingConfig(5)).toBeNull()
  })

  it('swallows storage failures', async () => {
    vi.spyOn(storage, 'removeItem').mockRejectedValueOnce(new Error('nope'))

    await expect(clearDemoScrapeFlag(5)).resolves.toBeUndefined()
  })
})
