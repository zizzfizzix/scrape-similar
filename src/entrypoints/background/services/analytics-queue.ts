import { queueMutex } from '@/utils/analytics'
import { getPostHogBackground, resetPostHogInstance } from '@/utils/posthog-background'
import log from 'loglevel'
import { PostHog } from 'posthog-js/dist/module.no-external'

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

/**
 * Flush any queued events that were captured before consent
 */
export const flushQueuedEvents = async (): Promise<void> => {
  return queueMutex.runExclusive(async () => {
    try {
      const queue = await eventQueueItem.getValue()

      if (queue.length === 0) {
        log.debug('No queued events to flush')
        return
      }

      const ph = await getPostHogBackground()
      if (!ph) {
        log.warn('PostHog not initialized when trying to flush queue')
        return
      }

      // Set rate limiting to match the queue length temporarily so PostHog doesn't drop events
      configurePostHogRateLimit(ph, queue.length)

      log.debug(`Flushing ${queue.length} queued events...`)

      // Process events sequentially to avoid overwhelming PostHog
      for (const event of queue) {
        try {
          ph.capture(
            event.name,
            {
              ...event.props,
              buffered: true,
            },
            {
              timestamp: new Date(event.timestamp),
            },
          )
        } catch (error) {
          log.error(`Failed to capture buffered event: ${event.name}`, error)
          // Continue processing other events
        }
      }

      // Reset rate limiting to default
      configurePostHogRateLimit(ph)

      // Clear the queue after successful processing
      await eventQueueItem.setValue([])
      log.debug(`Successfully flushed ${queue.length} buffered analytics events`)
    } catch (error) {
      const ph = await getPostHogBackground()

      if (ph && ph instanceof PostHog) {
        configurePostHogRateLimit(ph)
      }

      log.error('Error flushing queued events:', error)
    }
  })
}

/**
 * Set up analytics queue watchers
 * - Initialize PostHog and flush queue on startup
 * - React to consent changes
 * - Watch for new queued events
 */
export const initializeAnalyticsQueue = async (): Promise<void> => {
  // On background startup – attempt to init PostHog (if consent) and flush queue
  await getPostHogBackground().then(flushQueuedEvents)

  // Listen for consent changes to (re)initialize PostHog and flush queued events
  analyticsConsentItem.watch((value) => {
    const sanitizedConsentState = toConsentState(value)
    if (sanitizedConsentState === true) {
      // Consent granted - initialize PostHog and flush queue
      getPostHogBackground().then(flushQueuedEvents)
    } else if (sanitizedConsentState === false) {
      // Consent declined - reset PostHog instance and clear the queue safely
      resetPostHogInstance()

      // Acquire the same mutex used by queueEvent / flushQueuedEvents to avoid races
      queueMutex.runExclusive(async () => {
        await eventQueueItem.setValue([])
      })

      log.debug('User declined consent - reset PostHog and cleared event queue')
    }
  })

  // Watch for new items added to the analytics queue in case consent was granted after startup
  eventQueueItem.watch((queue) => {
    if (queue.length > 0) {
      flushQueuedEvents()
    }
  })
}
