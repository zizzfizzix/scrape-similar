import { toast } from 'sonner'
import { deleteBatchJob, type BatchScrapeJob } from './batch-scrape-db'
import type { StorageUsage } from './types'

/**
 * Delete a batch job with toast notifications and optional callback
 */
export const handleDeleteBatch = async (
  batch: BatchScrapeJob,
  onSuccess?: () => void,
): Promise<void> => {
  try {
    await deleteBatchJob(batch.id)
    toast.success('Batch deleted')
    onSuccess?.()
  } catch (error) {
    toast.error('Failed to delete batch')
    throw error
  }
}

/**
 * Navigate to duplicate a batch with the same config
 */
export const navigateToDuplicate = (batch: BatchScrapeJob): void => {
  const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
  url.searchParams.set('config', JSON.stringify(batch.config))
  window.location.href = url.toString()
}

/**
 * Navigate back to batch history
 */
export const navigateToBatchHistory = (): void => {
  window.location.href = browser.runtime.getURL('/batch-scrape-history.html')
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
