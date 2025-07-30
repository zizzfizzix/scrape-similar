import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

// Dynamically control the context value returned by getCurrentContext
let currentContext: any

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

import { EVENT_QUEUE_STORAGE_KEY, trackEvent } from '@/utils/analytics'

const QUEUE_KEY = `local:${EVENT_QUEUE_STORAGE_KEY}`
const EVENT_NAME = 'contextual_event'

// Helper to get the last queued event
const getQueuedEvent = async () => {
  const queue = (await storage.getItem<any[]>(QUEUE_KEY)) || []
  return queue[queue.length - 1]
}

describe('trackEvent – context specific behaviour', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
    // Default consent behaviour for these tests is granted
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    // Ensure PostHog is absent
    ;(globalThis as any).window = (globalThis as any).window || {}
    delete (globalThis as any).window.__scrape_similar_posthog
  })

  it('uses PostHog from background context', async () => {
    // Mock context and PostHog instance
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue({ capture: captureSpy } as any)

    await trackEvent(EVENT_NAME, { foo: 'bar' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0]
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
    expect(queued.name).toBe(EVENT_NAME)
    expect(queued.props.extension_context).toBe(contextDetection.EXTENSION_CONTEXTS.SIDEPANEL)
  })

  it('captures event via window PostHog in sidepanel when available', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.SIDEPANEL
    // Create a minimal window with PostHog stub
    ;(globalThis as any).window = {}
    const captureSpy = vi.fn()
    ;(globalThis as any).window.__scrape_similar_posthog = { capture: captureSpy }

    await trackEvent(EVENT_NAME, { baz: 'qux' })

    expect(captureSpy).toHaveBeenCalledTimes(1)
    const [capturedName, capturedProps] = captureSpy.mock.calls[0]
    expect(capturedName).toBe(EVENT_NAME)
    expect(capturedProps.baz).toBe('qux')
  })

  it('sends a message from content-script context', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.CONTENT_SCRIPT
    const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage')

    await trackEvent(EVENT_NAME, { alpha: 1 })

    expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    const [{ type, payload }] = sendMessageSpy.mock.calls[0] as any[]
    expect(type).toBeDefined()
    expect(payload.eventName).toBe(EVENT_NAME)
    expect(payload.properties.alpha).toBe(1)
  })

  it('retains existing extension_context in properties', async () => {
    currentContext = contextDetection.EXTENSION_CONTEXTS.BACKGROUND
    const captureSpy = vi.fn()
    vi.spyOn(posthogBg, 'getPostHogBackground').mockResolvedValue({ capture: captureSpy } as any)

    await trackEvent(EVENT_NAME, { extension_context: 'custom_context' })

    const [, capturedProps] = captureSpy.mock.calls[0]
    expect(capturedProps.extension_context).toBe('custom_context')
  })
})
