import { pauseBatchJob, resumeBatchJob, startBatchJob } from '@/utils/batch-operations'
import {
  createBatchJob,
  createUrlResults,
  liveGetBatchJob,
  liveGetBatchUrlResults,
  liveGetCombinedResults,
  updateBatchJob,
  type BatchScrapeJob,
  type BatchScrapeUrlResult,
  type BatchSettings,
  type BatchStatistics,
} from '@/utils/batch-scrape-db'
import { MESSAGE_TYPES } from '@/utils/types'
import { useLiveQuery } from 'dexie-react-hooks'
import log from 'loglevel'
import { useCallback, useState } from 'react'

export const useBatchScrape = (initialBatchId?: string) => {
  const [batchId, setBatchId] = useState<string | undefined>(initialBatchId)
  const [error, setError] = useState<string | null>(null)

  // Live queries - automatically update when IndexedDB changes
  const batch = useLiveQuery(
    () => (batchId ? liveGetBatchJob(batchId) : undefined),
    [batchId],
    undefined,
  ) as BatchScrapeJob | undefined

  const urlResults = useLiveQuery(
    () => (batchId ? liveGetBatchUrlResults(batchId) : Promise.resolve<BatchScrapeUrlResult[]>([])),
    [batchId],
  ) as BatchScrapeUrlResult[] | undefined

  const combinedResults = useLiveQuery(
    () => (batchId ? liveGetCombinedResults(batchId) : Promise.resolve<ScrapedRow[]>([])),
    [batchId],
  ) as ScrapedRow[] | undefined

  // Get statistics from the batch (materialized view - no computation needed!)
  const statistics: BatchStatistics = batch?.statistics || {
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalRows: 0,
  }

  // Loading is true when batch query is undefined (initial load)
  const loading = batch === undefined && batchId !== undefined

  // Create new batch
  const createBatch = useCallback(
    async (
      config: ScrapeConfig,
      urls: string[],
      name?: string,
      settings?: Partial<BatchSettings>,
    ) => {
      try {
        setError(null)

        const newBatch = await createBatchJob(config, urls, name, settings)
        await createUrlResults(newBatch.id, urls)

        // Set batch ID to trigger live queries
        setBatchId(newBatch.id)

        return newBatch
      } catch (err) {
        log.error('Error creating batch:', err)
        setError(err instanceof Error ? err.message : 'Failed to create batch')
        throw err
      }
    },
    [],
  )

  /**
   * Start a batch job.
   * @param id - Optional batch ID to start. If not provided, uses the batch from hook state.
   *             The optional ID is needed for the createAndStartBatch flow, where we need to
   *             start a batch immediately after creation, before the React state has updated
   *             with the new batch object.
   */
  const startBatch = useCallback(
    async (id?: string) => {
      const batchIdToStart = id ?? batch?.id
      if (!batchIdToStart) return

      try {
        setError(null)
        await startBatchJob(batchIdToStart)
      } catch (err) {
        log.error('Error starting batch:', err)
        setError(err instanceof Error ? err.message : 'Failed to start batch')
      }
    },
    [batch],
  )

  // Pause batch
  const pauseBatch = useCallback(async () => {
    if (!batch) return

    try {
      setError(null)
      await pauseBatchJob(batch.id)
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
      await resumeBatchJob(batch.id)
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
      if (!batchId) return

      try {
        setError(null)
        await updateBatchJob(batchId, { name })
        // No need to manually update state - useLiveQuery will automatically update
      } catch (err) {
        log.error('Error updating batch name:', err)
        setError(err instanceof Error ? err.message : 'Failed to update batch name')
      }
    },
    [batchId],
  )

  /**
   * Create and start a batch in one atomic operation.
   * This is a convenience function that combines createBatch + startBatch.
   * We pass the new batch ID directly to startBatch because the React state
   * hasn't updated yet with the new batch object when we call startBatch.
   */
  const createAndStartBatch = useCallback(
    async (
      config: ScrapeConfig,
      urls: string[],
      name?: string,
      settings?: Partial<BatchSettings>,
    ) => {
      try {
        // Create the batch using the existing function
        const newBatch = await createBatch(config, urls, name, settings)

        // Start it immediately using the ID (batch state hasn't updated yet)
        await startBatch(newBatch.id)

        return newBatch
      } catch (err) {
        log.error('Error creating and starting batch:', err)
        setError(err instanceof Error ? err.message : 'Failed to create and start batch')
        throw err
      }
    },
    [createBatch, startBatch],
  )

  return {
    batch: batch ?? null,
    urlResults: urlResults ?? [],
    statistics,
    combinedResults: combinedResults ?? [],
    loading,
    error,
    pauseBatch,
    resumeBatch,
    retryUrl,
    updateBatchName,
    createAndStartBatch,
  }
}
