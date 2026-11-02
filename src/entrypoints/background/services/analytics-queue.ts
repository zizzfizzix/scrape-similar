import {
  currentPostHogBackground,
  getPostHogBackground,
  resetPostHogInstance,
} from '@/utils/posthog-background'
import { reportingListener } from '@/utils/report-rejection'
import { withStorageLock } from '@/utils/storage-lock'
import log from 'loglevel'
import type { PostHog } from 'posthog-js/dist/module.no-external'

/**
 * Configure PostHog rate limiting
 */
export const configurePostHogRateLimit = (ph: PostHog, eventsPerSecond: number = 10): void => {
  ph.set_config({
    rate_limiting: {
      events_per_second: eventsPerSecond,
      events_burst_limit: eventsPerSecond * 10,
    },
  })
}

// Called under the queue lock.
const sendQueuedEvents = async (): Promise<void> => {
  const queue = await eventQueueItem.getValue()

  if (queue.length === 0) {
    log.debug('No queued events to flush')
    return
  }

  // Taken after the last await: a consent decline resets the instance, and
  // nothing may be sent through one it has reset.
  const ph = currentPostHogBackground()
  if (!ph) return

  // Set rate limiting to match the queue length temporarily so PostHog doesn't drop events
  configurePostHogRateLimit(ph, queue.length)
  try {
    log.debug(`Flushing ${queue.length} queued events...`)

    for (const event of queue) {
      try {
        ph.capture(
          event.name,
          {
            ...event.props,
            [ANALYTICS_PROPERTIES.BUFFERED]: true,
          },
          {
            timestamp: new Date(event.timestamp),
          },
        )
      } catch (error) {
        log.error(`Failed to capture buffered event: ${event.name}`, error)
      }
    }

    await eventQueueItem.setValue([])
  } finally {
    configurePostHogRateLimit(ph)
  }
  log.debug(`Successfully flushed ${queue.length} buffered analytics events`)
}

/**
 * Flush any queued events that were captured before consent
 */
export const flushQueuedEvents = async (): Promise<void> => {
  try {
    // Initialised before the lock, so pages queueing events do not wait on it,
    // and a flush that cannot send never takes the lock.
    if (!(await getPostHogBackground())) {
      log.debug('PostHog not initialized, leaving queued events for later')
      return
    }
    await withStorageLock(eventQueueItem, sendQueuedEvents)
  } catch (error) {
    log.error('Error flushing queued events:', error)
  }
}

/**
 * Set up analytics queue watchers
 * - Initialize PostHog and flush queue on startup
 * - React to consent changes
 * - Watch for new queued events
 */
export const initializeAnalyticsQueue = async (): Promise<void> => {
  // Listen for consent changes to (re)initialize PostHog and flush queued events
  analyticsConsentItem.watch(
    reportingListener(async (value) => {
      const sanitizedConsentState = toConsentState(value)
      if (sanitizedConsentState === true) {
        await flushQueuedEvents()
      } else if (sanitizedConsentState === false) {
        // Consent declined - reset PostHog instance and clear the queue safely
        resetPostHogInstance()

        await withStorageLock(eventQueueItem, () => eventQueueItem.setValue([]))

        log.debug('User declined consent - reset PostHog and cleared event queue')
      }
    }),
  )

  // Watch for new items added to the analytics queue in case consent was granted after startup
  eventQueueItem.watch(
    reportingListener(async (queue) => {
      if (queue.length > 0) {
        await flushQueuedEvents()
      }
    }),
  )

  // After the watchers: this flush can wait on a lock another context holds,
  // and a consent change during that wait must still reach the handler above.
  await flushQueuedEvents()
}
