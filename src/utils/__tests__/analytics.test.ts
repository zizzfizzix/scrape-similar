import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

import { captureEvent, MAX_QUEUED_EVENTS, queueEvent, type QueuedEvent } from '@/utils/analytics'
import * as consent from '@/utils/consent'

const QUEUE_KEY = eventQueueItem.key

describe('analytics utilities', () => {
  beforeEach(() => {
    // Reset fake browser storage and mocks before each test
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  describe('queueEvent', () => {
    it('adds an event to the queue in storage', async () => {
      const event = {
        name: ANALYTICS_EVENTS.PRESET_SAVE,
        props: { trigger: 'bar' },
        timestamp: Date.now(),
      }
      await queueEvent(event)

      const queue = await storage.getItem<(typeof event)[]>(QUEUE_KEY)
      expect(queue).toHaveLength(1)
      expect(queue?.[0]).toMatchObject(event)
    })

    it('logs and swallows a write failure', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      const failure = new Error('quota exceeded')
      vi.spyOn(eventQueueItem, 'setValue').mockRejectedValueOnce(failure)

      await expect(
        queueEvent({ name: ANALYTICS_EVENTS.PRESET_SAVE, props: {}, timestamp: Date.now() }),
      ).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith('Failed to queue event:', failure)
    })

    it('drops the oldest events when exceeding MAX_QUEUED_EVENTS', async () => {
      // Fill the queue up to the max limit
      for (let i = 0; i < MAX_QUEUED_EVENTS; i++) {
        await queueEvent({ name: ANALYTICS_EVENTS.PRESET_LOAD, props: {}, timestamp: i })
      }

      // Add one more to trigger overflow logic
      await queueEvent({ name: ANALYTICS_EVENTS.PRESET_SAVE, props: {}, timestamp: Date.now() })

      const queue = await storage.getItem<QueuedEvent[]>(QUEUE_KEY)
      expect(queue).toHaveLength(MAX_QUEUED_EVENTS)
      // The first event should have been dropped (FIFO)
      expect(queue?.[0]?.timestamp).toBe(1)
      expect(queue?.at(-1)?.name).toBe(ANALYTICS_EVENTS.PRESET_SAVE)
    })
  })

  describe('captureEvent', () => {
    it('does not queue or track when consent is declined', async () => {
      vi.spyOn(consent, 'getConsentState').mockResolvedValue(false)

      await captureEvent(ANALYTICS_EVENTS.PRESET_HIDE)

      const queue = await storage.getItem<QueuedEvent[]>(QUEUE_KEY)
      expect(queue).toBeNull()
    })

    it('queues the event when consent is undefined', async () => {
      vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)

      await captureEvent(ANALYTICS_EVENTS.PRESET_IMPORT, { reason: 'data' })

      const queue = await storage.getItem<QueuedEvent[]>(QUEUE_KEY)
      expect(queue).toHaveLength(1)
      // Original properties should be preserved
      expect(queue?.[0]).toMatchObject({
        name: ANALYTICS_EVENTS.PRESET_IMPORT,
        props: { reason: 'data' },
      })
    })
  })
})
