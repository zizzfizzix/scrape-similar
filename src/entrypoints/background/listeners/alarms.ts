import { deleteScrapeJob, getAllScrapeJobs } from '@/utils/scrape-db'
import log from 'loglevel'

const CLEANUP_ALARM_NAME = 'cleanup-expired-scrapes'
const EXPIRY_HOURS = 24

/**
 * Set up the cleanup alarm for expired single scrapes
 */
export const setupCleanupAlarm = async (): Promise<void> => {
  try {
    // Clear any existing alarm first
    await browser.alarms.clear(CLEANUP_ALARM_NAME)

    // Create alarm that fires daily (1440 minutes = 24 hours)
    await browser.alarms.create(CLEANUP_ALARM_NAME, {
      periodInMinutes: 1440,
      when: Date.now() + 60 * 1000, // First run in 1 minute
    })

    log.debug('Cleanup alarm created successfully')
  } catch (error) {
    log.error('Error setting up cleanup alarm:', error)
  }
}

/**
 * Clean up expired single scrapes
 * A scrape is eligible for cleanup if:
 * - It has a tabId (single/ephemeral scrape)
 * - The associated tab is closed
 * - It's older than 24 hours
 */
export const cleanupExpiredScrapes = async (): Promise<void> => {
  try {
    log.debug('Running cleanup of expired single scrapes...')

    const allJobs = await getAllScrapeJobs()
    const now = Date.now()
    const expiryMs = EXPIRY_HOURS * 60 * 60 * 1000

    let deletedCount = 0

    for (const job of allJobs) {
      // Skip if not a single scrape (no tabId)
      if (!job.tabId) continue

      // Skip if not expired
      if (now - job.createdAt < expiryMs) continue

      // Check if tab still exists
      try {
        await browser.tabs.get(job.tabId)
        // Tab exists, don't delete yet
        log.debug(`Tab ${job.tabId} still exists, keeping scrape job ${job.id}`)
        continue
      } catch (error) {
        // Tab doesn't exist - eligible for cleanup
        log.debug(`Tab ${job.tabId} not found, deleting expired scrape job ${job.id}`)
        await deleteScrapeJob(job.id)
        deletedCount++
      }
    }

    log.info(`Cleanup complete: deleted ${deletedCount} expired single scrapes`)
  } catch (error) {
    log.error('Error during cleanup:', error)
  }
}

/**
 * Set up the alarms listener
 */
export const setupAlarmsListener = (): void => {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM_NAME) {
      log.debug('Cleanup alarm triggered')
      cleanupExpiredScrapes()
    }
  })
}
