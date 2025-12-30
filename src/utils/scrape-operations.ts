import { deleteScrapeJob, type ScrapeJob } from '@/utils/scrape-db'
import { MESSAGE_TYPES, type StorageUsage } from '@/utils/types'
import log from 'loglevel'
import { toast } from 'sonner'

/**
 * Delete a scrape job with toast notifications and optional callback
 */
export const handleDeleteBatch = async (
  batch: ScrapeJob,
  onSuccess?: () => void,
): Promise<void> => {
  try {
    await deleteScrapeJob(batch.id)
    toast.success('Batch deleted')
    onSuccess?.()
  } catch (error) {
    toast.error('Failed to delete batch')
    throw error
  }
}

/**
 * Navigate to duplicate a batch with the same config, URLs, and settings
 * Loads data from the existing job in Dexie database
 */
export const navigateToDuplicate = (batch: ScrapeJob): void => {
  const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
  url.searchParams.set('duplicateFrom', batch.id)
  window.location.href = url.toString()
}

/**
 * Navigate back to batch history
 */
export const navigateToBatchHistory = (): void => {
  window.location.href = browser.runtime.getURL('/batch-scrape-history.html')
}

/**
 * Start a batch scrape job
 */
export const startBatchJob = async (batchId: string): Promise<void> => {
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.BATCH_SCRAPE_START,
      payload: { batchId },
    })
  } catch (error) {
    log.error('Error starting batch:', error)
    throw error
  }
}

/**
 * Pause a batch scrape job
 */
export const pauseBatchJob = async (batchId: string): Promise<void> => {
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.BATCH_SCRAPE_PAUSE,
      payload: { batchId },
    })
  } catch (error) {
    log.error('Error pausing batch:', error)
    throw error
  }
}

/**
 * Resume a batch scrape job
 */
export const resumeBatchJob = async (batchId: string): Promise<void> => {
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.BATCH_SCRAPE_RESUME,
      payload: { batchId },
    })
  } catch (error) {
    log.error('Error resuming batch:', error)
    throw error
  }
}

/**
 * Format storage usage for display
 * @param storageUsage - Storage usage object with used, quota, and percentUsed
 * @param showPercent - Whether to show percentage (default: false)
 */
export const formatStorageUsage = (storageUsage: StorageUsage, showPercent = false): string => {
  const used = (storageUsage.used / 1024 / 1024).toFixed(1)
  const quota = (storageUsage.quota / 1024 / 1024).toFixed(0)
  const base = `${used} MB / ${quota} MB`
  return showPercent ? `${base} (${storageUsage.percentUsed.toFixed(1)}%)` : base
}
