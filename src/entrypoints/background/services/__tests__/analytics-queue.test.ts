import type { QueuedEvent } from '@/entrypoints/background/types'
import { EVENT_QUEUE_STORAGE_KEY } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const posthogMocks = vi.hoisted(() => ({
  getPostHogBackground: vi.fn(),
  resetPostHogInstance: vi.fn(),
}))
vi.mock('@/utils/posthog-background', () => posthogMocks)

const { PostHog } = await import('posthog-js/dist/module.no-external')
const { configurePostHogRateLimit, flushQueuedEvents, initializeAnalyticsQueue } =
  await import('@/entrypoints/background/services/analytics-queue')

/** A PostHog stand-in that satisfies `instanceof PostHog`. */
const createFakePostHog = () => {
  const instance = Object.create(PostHog.prototype) as InstanceType<typeof PostHog>
  instance.capture = vi.fn() as never
  instance.set_config = vi.fn() as never
  return instance
}

const queueKey = `local:${EVENT_QUEUE_STORAGE_KEY}` as const
const readQueue = () => storage.getItem<QueuedEvent[]>(queueKey)
const event = (name: string, timestamp = 1_700_000_000_000): QueuedEvent => ({
  name,
  props: { source: 'test' },
  timestamp,
})

describe('configurePostHogRateLimit', () => {
  it('defaults to ten events per second with a ten-fold burst', () => {
    const ph = createFakePostHog()

    configurePostHogRateLimit(ph)

    expect(ph.set_config).toHaveBeenCalledWith({
      rate_limiting: { events_per_second: 10, events_burst_limit: 100 },
    })
  })

  it('scales the burst limit with the requested rate', () => {
    const ph = createFakePostHog()

    configurePostHogRateLimit(ph, 42)

    expect(ph.set_config).toHaveBeenCalledWith({
      rate_limiting: { events_per_second: 42, events_burst_limit: 420 },
    })
  })
})

describe('flushQueuedEvents', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    posthogMocks.getPostHogBackground.mockReset()
    posthogMocks.resetPostHogInstance.mockReset()
  })

  it('does nothing when the queue is empty', async () => {
    await flushQueuedEvents()

    expect(posthogMocks.getPostHogBackground).not.toHaveBeenCalled()
  })

  it('captures every queued event, marks it buffered and clears the queue', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await storage.setItem(queueKey, [event('first', 1000), event('second', 2000)])

    await flushQueuedEvents()

    expect(ph.capture).toHaveBeenCalledTimes(2)
    expect(ph.capture).toHaveBeenNthCalledWith(
      1,
      'first',
      { source: 'test', buffered: true },
      { timestamp: new Date(1000) },
    )
    expect(await readQueue()).toEqual([])
  })

  it('raises the rate limit to the queue length while flushing, then restores it', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await storage.setItem(queueKey, [event('a'), event('b'), event('c')])

    await flushQueuedEvents()

    expect(ph.set_config).toHaveBeenNthCalledWith(1, {
      rate_limiting: { events_per_second: 3, events_burst_limit: 30 },
    })
    expect(ph.set_config).toHaveBeenNthCalledWith(2, {
      rate_limiting: { events_per_second: 10, events_burst_limit: 100 },
    })
  })

  it('keeps the queue intact when PostHog is unavailable', async () => {
    posthogMocks.getPostHogBackground.mockResolvedValue(null)
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    await storage.setItem(queueKey, [event('kept')])

    await flushQueuedEvents()

    expect(warnSpy).toHaveBeenCalledWith('PostHog not initialized when trying to flush queue')
    expect(await readQueue()).toEqual([event('kept')])
  })

  it('keeps flushing the rest of the queue when one capture throws', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    vi.mocked(ph.capture).mockImplementationOnce(() => {
      throw new Error('capture failed')
    })
    await storage.setItem(queueKey, [event('bad'), event('good')])

    await flushQueuedEvents()

    expect(ph.capture).toHaveBeenCalledTimes(2)
    expect(await readQueue()).toEqual([])
  })

  it('restores the default rate limit when the flush itself fails', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await storage.setItem(queueKey, [event('a')])
    const failure = new Error('write failed')
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(failure)

    await flushQueuedEvents()

    expect(errorSpy).toHaveBeenCalledWith('Error flushing queued events:', failure)
    expect(ph.set_config).toHaveBeenLastCalledWith({
      rate_limiting: { events_per_second: 10, events_burst_limit: 100 },
    })
  })

  it('logs the failure even when no PostHog instance is available to reset', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await storage.setItem(queueKey, [event('a')])
    posthogMocks.getPostHogBackground
      .mockRejectedValueOnce(new Error('init failed'))
      .mockResolvedValueOnce(null)

    await flushQueuedEvents()

    expect(errorSpy).toHaveBeenCalledWith('Error flushing queued events:', expect.any(Error))
  })
})

describe('initializeAnalyticsQueue', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    posthogMocks.getPostHogBackground.mockReset()
    posthogMocks.resetPostHogInstance.mockReset()
  })

  it('flushes anything already queued on startup', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await storage.setItem(queueKey, [event('startup')])

    await initializeAnalyticsQueue()

    expect(ph.capture).toHaveBeenCalledWith('startup', expect.anything(), expect.anything())
  })

  it('flushes the queue when consent is granted later', async () => {
    posthogMocks.getPostHogBackground.mockResolvedValue(null)
    await initializeAnalyticsQueue()

    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await storage.setItem(queueKey, [event('queued')])
    await flushMicrotasks()
    await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)
    await flushMicrotasks()

    expect(ph.capture).toHaveBeenCalledWith('queued', expect.anything(), expect.anything())
  })

  it('resets PostHog and empties the queue when consent is declined', async () => {
    posthogMocks.getPostHogBackground.mockResolvedValue(null)
    await initializeAnalyticsQueue()
    await storage.setItem(queueKey, [event('discarded')])
    await flushMicrotasks()

    await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, false)
    await flushMicrotasks()

    expect(posthogMocks.resetPostHogInstance).toHaveBeenCalled()
    expect(await readQueue()).toEqual([])
  })

  it('ignores a consent value that is cleared back to undecided', async () => {
    posthogMocks.getPostHogBackground.mockResolvedValue(null)
    await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)
    await initializeAnalyticsQueue()
    posthogMocks.getPostHogBackground.mockClear()

    await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, '')
    await flushMicrotasks()

    expect(posthogMocks.resetPostHogInstance).not.toHaveBeenCalled()
    expect(posthogMocks.getPostHogBackground).not.toHaveBeenCalled()
  })

  it('flushes when new events land in the queue', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await initializeAnalyticsQueue()

    await storage.setItem(queueKey, [event('late')])
    await flushMicrotasks()

    expect(ph.capture).toHaveBeenCalledWith('late', expect.anything(), expect.anything())
  })

  it('does not flush when the queue watcher reports an empty queue', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await initializeAnalyticsQueue()

    await storage.setItem(queueKey, [])
    await flushMicrotasks()

    expect(ph.capture).not.toHaveBeenCalled()
  })

  it('does not flush when the queue is removed entirely', async () => {
    const ph = createFakePostHog()
    posthogMocks.getPostHogBackground.mockResolvedValue(ph)
    await storage.setItem(queueKey, [])
    await initializeAnalyticsQueue()

    await storage.removeItem(queueKey)
    await flushMicrotasks()

    expect(ph.capture).not.toHaveBeenCalled()
  })
})
