import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

import {
  EVENT_QUEUE_STORAGE_KEY,
  MAX_QUEUED_EVENTS,
  queueEvent,
  trackEvent,
} from '@/utils/analytics'
import * as consent from '@/utils/consent'

const QUEUE_KEY = `local:${EVENT_QUEUE_STORAGE_KEY}`

describe('analytics utilities', () => {
  beforeEach(() => {
    // Reset fake browser storage and mocks before each test
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  describe('queueEvent', () => {
    it('adds an event to the queue in storage', async () => {
      const event = { name: 'test_event', props: { foo: 'bar' }, timestamp: Date.now() }
      await queueEvent(event)

      const queue = await storage.getItem<(typeof event)[]>(QUEUE_KEY)
      expect(queue).toHaveLength(1)
      expect(queue?.[0]).toMatchObject(event)
    })

    it('drops the oldest events when exceeding MAX_QUEUED_EVENTS', async () => {
      // Fill the queue up to the max limit
      for (let i = 0; i < MAX_QUEUED_EVENTS; i++) {
        await queueEvent({ name: `event_${i}`, props: {}, timestamp: i })
      }

      // Add one more to trigger overflow logic
      await queueEvent({ name: 'overflow_event', props: {}, timestamp: Date.now() })

      const queue = await storage.getItem<any[]>(QUEUE_KEY)
      expect(queue).toHaveLength(MAX_QUEUED_EVENTS)
      // The first event should have been dropped (FIFO)
      expect(queue?.[0].name).toBe('event_1')
      expect(queue?.[queue.length - 1].name).toBe('overflow_event')
    })
  })

  describe('trackEvent', () => {
    it('does not queue or track when consent is declined', async () => {
      vi.spyOn(consent, 'getConsentState').mockResolvedValue(false)

      await trackEvent('declined_event')

      const queue = await storage.getItem<any[]>(QUEUE_KEY)
      expect(queue).toBeNull()
    })

    it('queues the event when consent is undefined', async () => {
      vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)

      await trackEvent('pending_consent_event', { extra: 'data' })

      const queue = await storage.getItem<any[]>(QUEUE_KEY)
      expect(queue).toHaveLength(1)
      const queued = queue![0]
      expect(queued.name).toBe('pending_consent_event')
      // Original properties should be preserved
      expect(queued.props.extra).toBe('data')
    })
  })
})
