import { version } from '@@/package.json' with { type: 'json' }
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'

// Dynamically control the context value returned by getCurrentContext
let currentContext: string

vi.mock('@/utils/context-detection', async () => {
  const actual = await vi.importActual<typeof import('@/utils/context-detection')>(
    '@/utils/context-detection',
  )
  return {
    ...actual,
    getCurrentContext: () => currentContext,
  }
})

import * as consent from '@/utils/consent'
import * as contextDetection from '@/utils/context-detection'
import * as posthogBg from '@/utils/posthog-background'

import { captureEvent, trackContentScriptEvent, trackEvent } from '@/utils/analytics'

type BackgroundPostHog = NonNullable<Awaited<ReturnType<typeof posthogBg.getPostHogBackground>>>

const stubBackgroundPostHog = (capture: (...args: unknown[]) => void) =>
  ({ capture }) as unknown as BackgroundPostHog

// Tests replace `window` wholesale, to stub the UI PostHog or to run without one.
interface StubWindow {
  __scrape_similar_posthog?: unknown
  location?: { href: string }
}
const testGlobal = globalThis as unknown as { window: StubWindow | undefined }

const EVENT_NAME = ANALYTICS_EVENTS.SETTINGS_OPEN

// Helper to get the last queued event
const getQueuedEvent = async () => {
  const queue = await eventQueueItem.getValue()
  return queue[queue.length - 1]
}

describe('captureEvent – context specific behaviour', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
    // Default consent behaviour for these tests is granted
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    // Ensure PostHog is absent
    testGlobal.window = testGlobal.window || {}
    delete testGlobal.window.__scrape_similar_posthog
  })

  it('uses PostHog from background context', async () => {
    // Mock context and PostHog instance
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(stubBackgroundPostHog(captureSpy))

    await captureEvent(EVENT_NAME, { trigger: 'bar' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedName).toBe(EVENT_NAME)
    expect(capturedProps.trigger).toBe('bar')
    // extension_context should be BACKGROUND by default
    expect(capturedProps.extension_context).toBe(contextDetection.EXTENSION_CONTEXTS.BACKGROUND)
  })

  it('queues event in sidepanel when PostHog is unavailable', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.SIDEPANEL

    await captureEvent(EVENT_NAME)

    expect(await getQueuedEvent()).toMatchObject({
      name: EVENT_NAME,
      props: { extension_context: contextDetection.EXTENSION_CONTEXTS.SIDEPANEL },
    })
  })

  it('captures event via window PostHog in sidepanel when available', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.SIDEPANEL
    // Create a minimal window with PostHog stub
    const captureSpy = vi.fn()
    testGlobal.window = { __scrape_similar_posthog: { capture: captureSpy } }

    await captureEvent(EVENT_NAME, { url: 'qux' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedName).toBe(EVENT_NAME)
    expect(capturedProps.url).toBe('qux')
  })

  it('overwrites envelope properties a caller passes despite the type', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(stubBackgroundPostHog(captureSpy))
    const smuggled = {
      trigger: 'bar',
      environment: 'fake_env',
      extension_context: 'fake_context',
      extension_version: '0.0.0',
    }

    await captureEvent(EVENT_NAME, smuggled)

    const [, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedProps).toMatchObject({
      environment: import.meta.env.MODE,
      extension_context: contextDetection.EXTENSION_CONTEXTS.BACKGROUND,
      extension_version: version,
    })
  })

  it('tracks a forwarded content-script event with the content script as its context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(stubBackgroundPostHog(captureSpy))

    expect(trackContentScriptEvent(EVENT_NAME, { trigger: 'bar' })).toBeUndefined()

    await vi.waitFor(() =>
      expect(captureSpy).toHaveBeenCalledWith(
        EVENT_NAME,
        expect.objectContaining({
          trigger: 'bar',
          extension_context: contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT,
        }),
      ),
    )
  })

  it('warns instead of capturing when the background PostHog is unavailable', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(null)

    await captureEvent(EVENT_NAME)

    expect(warnSpy).toHaveBeenCalledWith('PostHog not available in background context')
    // Consent is granted, so the event is dropped rather than queued for later.
    expect(await getQueuedEvent()).toBeUndefined()
  })

  it('sends only the caller properties from content-script context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined)

    await captureEvent(EVENT_NAME, { trigger: 'bar' })

    expect(sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.TRACK_EVENT,
      payload: { eventName: EVENT_NAME, properties: { trigger: 'bar' } },
    })
  })

  it('hands an undecided-consent event from a content script to the background', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)
    const sendMessage = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined)

    await captureEvent(EVENT_NAME)

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: MESSAGE_TYPES.TRACK_EVENT }),
    )
    expect(await getQueuedEvent()).toBeUndefined()
  })

  it('queues an undecided-consent event from an unknown context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.UNKNOWN
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)

    await captureEvent(EVENT_NAME)

    expect((await getQueuedEvent())?.name).toBe(EVENT_NAME)
  })

  it('swallows a send failure from content-script context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('receiving end does not exist')
    // `sendMessage` rejects rather than throwing, which is only caught because
    // the call is awaited.
    vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(failure)

    await expect(captureEvent(EVENT_NAME)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to send tracking message from content script:',
      failure,
    )
  })

  it('reports "N/A" for the URL when an unknown context has no window', async () => {
    currentContext = 'martian_context'
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    testGlobal.window = undefined

    await captureEvent(EVENT_NAME)

    const [, details] = warnSpy.mock.calls[0] as unknown[]
    expect(details).toMatchObject({ context: 'martian_context', hasWindow: false, url: 'N/A' })
  })

  it('reports the page URL for an unknown context that has a window', async () => {
    currentContext = 'martian_context'
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    testGlobal.window = { location: { href: 'https://example.com/page' } }

    await captureEvent(EVENT_NAME)

    const [, details] = warnSpy.mock.calls[0] as unknown[]
    expect(details).toMatchObject({ hasWindow: true, url: 'https://example.com/page' })
  })

  it('logs and swallows a failure raised before the context switch', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(consent, 'getConsentState').mockRejectedValue(failure)

    await expect(captureEvent(EVENT_NAME)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Error tracking event:', failure)
  })

  it('hands trackEvent callers no promise, and captures anyway', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(stubBackgroundPostHog(captureSpy))

    expect(trackEvent(EVENT_NAME, { trigger: 'bar' })).toBeUndefined()

    await vi.waitFor(() =>
      expect(captureSpy).toHaveBeenCalledWith(
        EVENT_NAME,
        expect.objectContaining({ trigger: 'bar' }),
      ),
    )
  })
})
