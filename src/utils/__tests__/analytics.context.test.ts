import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

// Dynamically control the context value returned by getCurrentContext.
// 'martian_context' is not an ExtensionContext, which is the point of the two
// tests that use it.
let currentContext: ExtensionContext | 'martian_context'

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
import type { ExtensionContext } from '@/utils/context-detection'
import * as contextDetection from '@/utils/context-detection'
import * as posthogBg from '@/utils/posthog-background'
import type { PostHog } from 'posthog-js/dist/module.no-external'
import type { Mock } from 'vitest'

import { EVENT_QUEUE_STORAGE_KEY, type QueuedEvent, trackEvent } from '@/utils/analytics'

const QUEUE_KEY = `local:${EVENT_QUEUE_STORAGE_KEY}`
const EVENT_NAME = 'contextual_event'

// Helper to get the last queued event
const getQueuedEvent = async () => {
  const queue = (await storage.getItem<QueuedEvent[]>(QUEUE_KEY)) || []
  return queue[queue.length - 1]
}

/**
 * `getPostHogBackground` resolves to a whole `PostHog`; these tests only reach
 * for `capture`, so the cast that says so lives here rather than at each call.
 */
const stubBackgroundPostHog = (capture: Mock) =>
  vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue({ capture } as unknown as PostHog)

describe('trackEvent – context specific behaviour', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
    // Default consent behaviour for these tests is granted
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    // These run in the node environment, where there is no `window` at all —
    // and `trackEvent`'s UI branch reads one. Give it an empty one, so PostHog
    // is absent until a test puts it there.
    vi.stubGlobal('window', {})
  })

  it('uses PostHog from background context', async () => {
    // Mock context and PostHog instance
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    stubBackgroundPostHog(captureSpy)

    await trackEvent(EVENT_NAME, { foo: 'bar' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedName).toBe(EVENT_NAME)
    expect(capturedProps.foo).toBe('bar')
    // extension_context should be BACKGROUND by default
    expect(capturedProps.extension_context).toBe(contextDetection.EXTENSION_CONTEXTS.BACKGROUND)
  })

  it('queues event in sidepanel when PostHog is unavailable', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.SIDEPANEL

    await trackEvent(EVENT_NAME)

    const queued = await getQueuedEvent()
    expect(queued).toBeTruthy()
    expect(queued?.name).toBe(EVENT_NAME)
    expect(queued?.props.extension_context).toBe(contextDetection.EXTENSION_CONTEXTS.SIDEPANEL)
  })

  it('captures event via window PostHog in sidepanel when available', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.SIDEPANEL
    // Create a minimal window with PostHog stub
    const captureSpy = vi.fn()
    vi.stubGlobal('window', { __scrape_similar_posthog: { capture: captureSpy } })

    await trackEvent(EVENT_NAME, { baz: 'qux' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedName).toBe(EVENT_NAME)
    expect(capturedProps.baz).toBe('qux')
  })

  it('sends a message from content-script context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage')

    await trackEvent(EVENT_NAME, { alpha: 1 })

    expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    const [{ type, payload }] = sendMessageSpy.mock.calls[0] as unknown as [
      { type: string; payload: TrackEventPayload },
    ]
    expect(type).toBeDefined()
    expect(payload.eventName).toBe(EVENT_NAME)
    expect(payload.properties.alpha).toBe(1)
  })

  it('retains existing extension_context in properties', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    stubBackgroundPostHog(captureSpy)

    await trackEvent(EVENT_NAME, { extension_context: 'custom_context' })

    const [, capturedProps] = captureSpy.mock.calls[0] ?? []
    expect(capturedProps.extension_context).toBe('custom_context')
  })

  it('warns instead of capturing when the background PostHog is unavailable', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue(null)

    await trackEvent(EVENT_NAME)

    expect(warnSpy).toHaveBeenCalledWith('PostHog not available in background context')
    // Consent is granted, so the event is dropped rather than queued for later.
    expect(await getQueuedEvent()).toBeUndefined()
  })

  it('swallows a send failure from content-script context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {})
    const failure = new Error('receiving end does not exist')
    vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(() => {
      throw failure
    })

    await expect(trackEvent(EVENT_NAME)).resolves.toBeUndefined()

    expect(debugSpy).toHaveBeenCalledWith(
      'Failed to send tracking message from content script:',
      failure,
    )
  })

  it('reports "N/A" for the URL when an unknown context has no window', async () => {
    currentContext = 'martian_context'
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    vi.stubGlobal('window', undefined)

    await trackEvent(EVENT_NAME)

    const [, details] = warnSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(details).toMatchObject({ context: 'martian_context', hasWindow: false, url: 'N/A' })
  })

  it('reports the page URL for an unknown context that has a window', async () => {
    currentContext = 'martian_context'
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    vi.stubGlobal('window', { location: { href: 'https://example.com/page' } })

    await trackEvent(EVENT_NAME)

    const [, details] = warnSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(details).toMatchObject({ hasWindow: true, url: 'https://example.com/page' })
  })

  it('logs and swallows a failure raised before the context switch', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(consent, 'getConsentState').mockRejectedValue(failure)

    await expect(trackEvent(EVENT_NAME)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Error tracking event:', failure)
  })
})
