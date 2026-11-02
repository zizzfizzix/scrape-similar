import type { QueuedEvent } from '@/utils/analytics'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const posthogMocks = vi.hoisted(() => ({
  currentPostHogBackground: vi.fn(),
  getPostHogBackground: vi.fn(),
  resetPostHogInstance: vi.fn(),
}))

/** Makes `ph` both what initialisation returns and the instance currently held. */
const usePostHog = (ph: unknown) => {
  posthogMocks.getPostHogBackground.mockResolvedValue(ph)
  posthogMocks.currentPostHogBackground.mockReturnValue(ph)
}
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

const queueKey = eventQueueItem.key
const readQueue = () => storage.getItem<QueuedEvent[]>(queueKey)
const event = (name: AnalyticsEvent, timestamp = 1_700_000_000_000): QueuedEvent => ({
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
  beforeEach(async () => {
    fakeBrowser.reset()
    posthogMocks.getPostHogBackground.mockReset()
    posthogMocks.currentPostHogBackground.mockReset()
    posthogMocks.resetPostHogInstance.mockReset()
    await storage.setItem(analyticsConsentItem.key, true)
  })

  it('does nothing when the queue is empty', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)

    await flushQueuedEvents()

    expect(ph.capture).not.toHaveBeenCalled()
    expect(ph.set_config).not.toHaveBeenCalled()
  })

  it('captures every queued event, marks it buffered and clears the queue', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(queueKey, [
      event(ANALYTICS_EVENTS.PRESET_LOAD, 1000),
      event(ANALYTICS_EVENTS.PRESET_SAVE, 2000),
    ])

    await flushQueuedEvents()

    expect(ph.capture).toHaveBeenCalledTimes(2)
    expect(ph.capture).toHaveBeenNthCalledWith(
      1,
      ANALYTICS_EVENTS.PRESET_LOAD,
      { source: 'test', buffered: true },
      { timestamp: new Date(1000) },
    )
    expect(await readQueue()).toEqual([])
  })

  it('raises the rate limit to the queue length while flushing, then restores it', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(queueKey, [
      event(ANALYTICS_EVENTS.PRESET_LOAD),
      event(ANALYTICS_EVENTS.PRESET_SAVE),
      event(ANALYTICS_EVENTS.PRESET_DELETION),
    ])

    await flushQueuedEvents()

    expect(ph.set_config).toHaveBeenNthCalledWith(1, {
      rate_limiting: { events_per_second: 3, events_burst_limit: 30 },
    })
    expect(ph.set_config).toHaveBeenNthCalledWith(2, {
      rate_limiting: { events_per_second: 10, events_burst_limit: 100 },
    })
  })

  it('leaves the queue and its lock alone while consent is undecided', async () => {
    await storage.removeItem(analyticsConsentItem.key)
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    const requestSpy = vi.spyOn(navigator.locks, 'request')

    await flushQueuedEvents()

    expect(await readQueue()).toEqual([event(ANALYTICS_EVENTS.PRESET_LOAD)])
    // Pages queueing events wait on this lock, so a flush that cannot send must not take it.
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it('keeps the queue intact when PostHog is unavailable', async () => {
    usePostHog(null)
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])

    await flushQueuedEvents()

    expect(await readQueue()).toEqual([event(ANALYTICS_EVENTS.PRESET_LOAD)])
  })

  it('sends nothing when consent is withdrawn while it waits for the lock', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    let release = () => {}
    const held = navigator.locks.request(
      queueKey,
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const flushing = flushQueuedEvents()
    await flushMicrotasks()
    // The decline handler resets the instance while the flush waits.
    posthogMocks.currentPostHogBackground.mockReturnValue(null)
    release()
    await Promise.all([held, flushing])

    expect(ph.capture).not.toHaveBeenCalled()
    expect(await readQueue()).toEqual([event(ANALYTICS_EVENTS.PRESET_LOAD)])
  })

  it('keeps flushing the rest of the queue when one capture throws', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    vi.mocked(ph.capture).mockImplementationOnce(() => {
      throw new Error('capture failed')
    })
    await storage.setItem(queueKey, [
      event(ANALYTICS_EVENTS.PRESET_LOAD),
      event(ANALYTICS_EVENTS.PRESET_SAVE),
    ])

    await flushQueuedEvents()

    expect(ph.capture).toHaveBeenCalledTimes(2)
    expect(await readQueue()).toEqual([])
  })

  it('restores the default rate limit when the flush itself fails', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    const failure = new Error('write failed')
    vi.spyOn(eventQueueItem, 'setValue').mockRejectedValueOnce(failure)

    await flushQueuedEvents()

    expect(errorSpy).toHaveBeenCalledWith('Error flushing queued events:', failure)
    expect(ph.set_config).toHaveBeenLastCalledWith({
      rate_limiting: { events_per_second: 10, events_burst_limit: 100 },
    })
  })

  it('logs the failure even when no PostHog instance is available to reset', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
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
    posthogMocks.currentPostHogBackground.mockReset()
    posthogMocks.resetPostHogInstance.mockReset()
  })

  it('flushes anything already queued on startup', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(analyticsConsentItem.key, true)
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])

    await initializeAnalyticsQueue()

    expect(ph.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRESET_LOAD,
      expect.anything(),
      expect.anything(),
    )
  })

  it('flushes the queue when consent is granted later', async () => {
    usePostHog(null)
    await initializeAnalyticsQueue()

    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    await flushMicrotasks()
    await storage.setItem(analyticsConsentItem.key, true)
    await flushMicrotasks()

    expect(ph.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRESET_LOAD,
      expect.anything(),
      expect.anything(),
    )
  })

  it('hears a decline while the startup flush waits for the queue lock', async () => {
    usePostHog(createFakePostHog())
    await storage.setItem(analyticsConsentItem.key, true)
    let release = () => {}
    const held = navigator.locks.request(
      queueKey,
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const starting = initializeAnalyticsQueue()
    await flushMicrotasks()
    await storage.setItem(analyticsConsentItem.key, false)
    await flushMicrotasks()

    expect(posthogMocks.resetPostHogInstance).toHaveBeenCalled()
    release()
    await Promise.all([held, starting])
  })

  it('resets PostHog and empties the queue when consent is declined', async () => {
    usePostHog(null)
    await initializeAnalyticsQueue()
    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    await flushMicrotasks()

    await storage.setItem(analyticsConsentItem.key, false)
    await flushMicrotasks()

    expect(posthogMocks.resetPostHogInstance).toHaveBeenCalled()
    expect(await readQueue()).toEqual([])
  })

  it('ignores a consent value that is cleared back to undecided', async () => {
    usePostHog(null)
    await storage.setItem(analyticsConsentItem.key, true)
    await initializeAnalyticsQueue()
    posthogMocks.getPostHogBackground.mockClear()

    await storage.setItem(analyticsConsentItem.key, '')
    await flushMicrotasks()

    expect(posthogMocks.resetPostHogInstance).not.toHaveBeenCalled()
    expect(posthogMocks.getPostHogBackground).not.toHaveBeenCalled()
  })

  it('flushes when new events land in the queue', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(analyticsConsentItem.key, true)
    await initializeAnalyticsQueue()

    await storage.setItem(queueKey, [event(ANALYTICS_EVENTS.PRESET_LOAD)])
    await flushMicrotasks()

    expect(ph.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRESET_LOAD,
      expect.anything(),
      expect.anything(),
    )
  })

  it('does not flush when the queue watcher reports an empty queue', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await initializeAnalyticsQueue()

    await storage.setItem(queueKey, [])
    await flushMicrotasks()

    expect(ph.capture).not.toHaveBeenCalled()
  })

  it('does not flush when the queue is removed entirely', async () => {
    const ph = createFakePostHog()
    usePostHog(ph)
    await storage.setItem(queueKey, [])
    await initializeAnalyticsQueue()

    await storage.removeItem(queueKey)
    await flushMicrotasks()

    expect(ph.capture).not.toHaveBeenCalled()
  })
})
