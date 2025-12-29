import {
  createBatchJob,
  createUrlResults,
  getBatchJob,
  getBatchStatistics,
  getBatchUrlResults,
  getCombinedResults,
  updateBatchJob,
  type BatchScrapeJob,
  type BatchScrapeUrlResult,
  type BatchSettings,
} from '@/utils/batch-scrape-db'
import log from 'loglevel'
import { useCallback, useEffect, useState } from 'react'

export interface BatchStatistics {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  totalRows: number
}

export const useBatchScrape = (initialBatchId?: string, initialConfig?: ScrapeConfig) => {
  const [batch, setBatch] = useState<BatchScrapeJob | null>(null)
  const [urlResults, setUrlResults] = useState<BatchScrapeUrlResult[]>([])
  const [statistics, setStatistics] = useState<BatchStatistics>({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalRows: 0,
  })
  const [combinedResults, setCombinedResults] = useState<ScrapedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load batch data
  const loadBatch = useCallback(async (batchId: string) => {
    try {
      setLoading(true)
      setError(null)

      const batchData = await getBatchJob(batchId)
      if (!batchData) {
        setError('Batch not found')
        return
      }

      setBatch(batchData)

      // Load URL results
      const results = await getBatchUrlResults(batchId)
      setUrlResults(results)

      // Load statistics
      const stats = await getBatchStatistics(batchId)
      setStatistics(stats)

      // Load combined results if completed
      if (batchData.status === 'completed' || stats.completed > 0) {
        const combined = await getCombinedResults(batchId)
        setCombinedResults(combined)
      }

      setLoading(false)
    } catch (err) {
      log.error('Error loading batch:', err)
      setError(err instanceof Error ? err.message : 'Failed to load batch')
      setLoading(false)
    }
  }, [])

  // Create new batch
  const createBatch = useCallback(
    async (
      config: ScrapeConfig,
      urls: string[],
      name?: string,
      settings?: Partial<BatchSettings>,
    ) => {
      try {
        setLoading(true)
        setError(null)

        const newBatch = await createBatchJob(config, urls, name, settings)
        await createUrlResults(newBatch.id, urls)

        setBatch(newBatch)
        await loadBatch(newBatch.id)

        return newBatch
      } catch (err) {
        log.error('Error creating batch:', err)
        setError(err instanceof Error ? err.message : 'Failed to create batch')
        setLoading(false)
        throw err
      }
    },
    [loadBatch],
  )

  // Start batch
  const startBatch = useCallback(async () => {
    if (!batch) return

    try {
      setError(null)
      await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.BATCH_SCRAPE_START,
        payload: { batchId: batch.id },
      })
    } catch (err) {
      log.error('Error starting batch:', err)
      setError(err instanceof Error ? err.message : 'Failed to start batch')
    }
  }, [batch])

  // Pause batch
  const pauseBatch = useCallback(async () => {
    if (!batch) return

    try {
      setError(null)
      await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.BATCH_SCRAPE_PAUSE,
        payload: { batchId: batch.id },
      })
    } catch (err) {
      log.error('Error pausing batch:', err)
      setError(err instanceof Error ? err.message : 'Failed to pause batch')
    }
  }, [batch])

  // Resume batch
  const resumeBatch = useCallback(async () => {
    if (!batch) return

    try {
      setError(null)
      await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.BATCH_SCRAPE_RESUME,
        payload: { batchId: batch.id },
      })
    } catch (err) {
      log.error('Error resuming batch:', err)
      setError(err instanceof Error ? err.message : 'Failed to resume batch')
    }
  }, [batch])

  // Retry URL
  const retryUrl = useCallback(
    async (urlResultId: string) => {
      if (!batch) return

      try {
        setError(null)
        await browser.runtime.sendMessage({
          type: MESSAGE_TYPES.BATCH_SCRAPE_RETRY_URL,
          payload: { batchId: batch.id, urlResultId },
        })
      } catch (err) {
        log.error('Error retrying URL:', err)
        setError(err instanceof Error ? err.message : 'Failed to retry URL')
      }
    },
    [batch],
  )

  // Update batch name
  const updateBatchName = useCallback(
    async (name: string) => {
      if (!batch) return

      try {
        setError(null)
        await updateBatchJob(batch.id, { name })
        setBatch({ ...batch, name })
      } catch (err) {
        log.error('Error updating batch name:', err)
        setError(err instanceof Error ? err.message : 'Failed to update batch name')
      }
    },
    [batch],
  )

  // Watch for changes to the batch and URL results
  useEffect(() => {
    if (!batch?.id) return

    // Track last completed count to avoid unnecessary updates
    let lastCompletedCount = 0
    let lastTotalRows = 0

    // Set up polling for updates
    const interval = setInterval(async () => {
      try {
        // Get updated batch
        const updated = await getBatchJob(batch.id)
        if (updated) {
          setBatch((prev) => {
            // Only update if something changed
            if (
              !prev ||
              prev.status !== updated.status ||
              prev.name !== updated.name ||
              prev.updatedAt !== updated.updatedAt
            ) {
              return updated
            }
            return prev
          })
        }

        // Get updated URL results and statistics
        const results = await getBatchUrlResults(batch.id)
        const stats = await getBatchStatistics(batch.id)

        // Update URL results only if count changed
        setUrlResults((prev) => {
          if (prev.length !== results.length) return results
          // Check if any status changed
          const statusChanged = results.some((r, i) => prev[i] && prev[i].status !== r.status)
          return statusChanged ? results : prev
        })

        setStatistics(stats)

        // Only reload combined results if more items completed or total rows changed
        if (stats.completed > lastCompletedCount || stats.totalRows !== lastTotalRows) {
          const combined = await getCombinedResults(batch.id)
          setCombinedResults((prev) => {
            // Only update if row count changed
            if (prev.length !== combined.length) {
              lastCompletedCount = stats.completed
              lastTotalRows = stats.totalRows
              return combined
            }
            return prev
          })
        }
      } catch (err) {
        log.error('Error polling batch updates:', err)
      }
    }, 2000) // Poll every 2 seconds (reduced from 1s)

    return () => {
      clearInterval(interval)
    }
  }, [batch?.id])

  // Initialize from URL params
  useEffect(() => {
    if (initialBatchId) {
      loadBatch(initialBatchId)
    }
  }, [initialBatchId, loadBatch])

  return {
    batch,
    urlResults,
    statistics,
    combinedResults,
    loading,
    error,
    createBatch,
    startBatch,
    pauseBatch,
    resumeBatch,
    retryUrl,
    updateBatchName,
    loadBatch,
  }
}
