import { closeHiddenTab, createHiddenTab } from '@/entrypoints/background/services/hidden-tabs'
import {
  batchScrapeDb,
  getBatchJob,
  getFailedUrlResults,
  getPendingUrlResults,
  updateBatchJob,
  updateUrlResult,
  type BatchScrapeJob,
  type BatchScrapeUrlResult,
} from '@/utils/batch-scrape-db'
import { calculateRetryDelay } from '@/utils/batch-url-utils'
import log from 'loglevel'

// Track active batch scrape sessions
const activeBatches = new Map<
  string,
  {
    status: 'running' | 'paused' | 'cancelled'
    runningTabs: Set<number>
    controller: AbortController
    // Promise that resolves when pause is triggered - allows immediate response
    pauseSignal: { promise: Promise<void>; resolve: () => void }
  }
>()

/**
 * Start a batch scrape job
 */
export const startBatchScrape = async (batchId: string): Promise<void> => {
  try {
    const batch = await getBatchJob(batchId)
    if (!batch) {
      throw new Error('Batch job not found')
    }

    // Check if already running
    if (activeBatches.has(batchId)) {
      log.warn(`Batch ${batchId} is already running`)
      return
    }

    // Initialize active batch tracking
    const controller = new AbortController()

    // Create a pause signal promise that can be resolved externally
    let pauseResolve: () => void
    const pausePromise = new Promise<void>((resolve) => {
      pauseResolve = resolve
    })

    activeBatches.set(batchId, {
      status: 'running',
      runningTabs: new Set(),
      controller,
      pauseSignal: { promise: pausePromise, resolve: pauseResolve! },
    })

    // Update batch status
    await updateBatchJob(batchId, { status: 'running' })

    log.debug(`Starting batch scrape: ${batchId}`)

    // Execute the batch scrape
    await executeBatchScrape(batch, controller.signal)

    // Check if batch was paused before cleaning up
    const finalActiveState = activeBatches.get(batchId)
    const wasPaused = finalActiveState?.status === 'paused'

    // Clean up
    activeBatches.delete(batchId)

    // Update final status - check if all URLs are done using materialized statistics
    const updatedBatch = await getBatchJob(batchId)
    if (updatedBatch) {
      const stats = updatedBatch.statistics
      const allCompleted = stats.pending === 0 && stats.running === 0

      // Only mark as completed if:
      // 1. All work is done AND
      // 2. Batch wasn't paused (check both memory and DB status)
      if (allCompleted && !wasPaused && updatedBatch.status !== 'paused') {
        await updateBatchJob(batchId, { status: 'completed' })
      }
    }

    log.debug(`Batch scrape finished: ${batchId}${wasPaused ? ' (was paused)' : ''}`)
  } catch (error) {
    log.error('Error starting batch scrape:', error)
    activeBatches.delete(batchId)
    await updateBatchJob(batchId, { status: 'paused' })
    throw error
  }
}

/**
 * Execute batch scrape with concurrency control
 */
const executeBatchScrape = async (batch: BatchScrapeJob, signal: AbortSignal): Promise<void> => {
  const { id: batchId, settings, config } = batch
  const { maxConcurrency, delayBetweenRequests, maxRetries, disableJsRendering } = settings

  // Get pending URLs
  const pendingResults = await getPendingUrlResults(batchId)
  if (pendingResults.length === 0) {
    log.debug('No pending URLs to scrape')
    return
  }

  // Process URLs with concurrency control
  const queue = [...pendingResults]
  const running: Promise<void>[] = []

  while (queue.length > 0 || running.length > 0) {
    // Check if cancelled
    if (signal.aborted) {
      log.debug('Batch scrape cancelled')
      break
    }

    // Check if paused
    const activeState = activeBatches.get(batchId)
    if (activeState?.status === 'paused') {
      log.debug('Batch scrape paused')
      break
    }

    // Start new scrapes up to max concurrency
    while (queue.length > 0 && running.length < maxConcurrency) {
      // Check pause/cancel before starting new request
      if (signal.aborted || activeBatches.get(batchId)?.status === 'paused') {
        break
      }

      const urlResult = queue.shift()!
      const promise = scrapeUrl(batchId, urlResult, config, maxRetries, disableJsRendering)
        .then(() => {
          // Remove from running list
          const index = running.indexOf(promise)
          if (index > -1) running.splice(index, 1)
        })
        .catch((error) => {
          log.error('Error scraping URL:', error)
          const index = running.indexOf(promise)
          if (index > -1) running.splice(index, 1)
        })

      running.push(promise)

      // Add delay between requests
      if (delayBetweenRequests > 0 && queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests))
      }
    }

    // Wait for at least one to complete OR pause to be triggered
    if (running.length > 0) {
      const activeState = activeBatches.get(batchId)

      // Race between: any request completing OR pause signal triggered
      await Promise.race([
        Promise.race(running),
        activeState?.pauseSignal.promise ?? Promise.resolve(),
      ])
    }
  }

  // Always wait for running requests to complete, even if paused
  // This allows in-flight requests to finish naturally
  if (running.length > 0) {
    log.debug(`Waiting for ${running.length} running requests to complete...`)
    await Promise.all(running)
  }
}

/**
 * Scrape a single URL with retry logic
 */
const scrapeUrl = async (
  batchId: string,
  urlResult: BatchScrapeUrlResult,
  config: ScrapeConfig,
  maxRetries: number,
  disableJs: boolean,
): Promise<void> => {
  const { id: urlResultId, url, retryCount } = urlResult

  try {
    // Update status to running
    await updateUrlResult(urlResultId, {
      status: 'running',
      startedAt: Date.now(),
    })

    // Track the tab
    const activeState = activeBatches.get(batchId)

    // Create hidden tab
    const tabResult = await createHiddenTab(url, disableJs)

    if (!tabResult.success || !tabResult.tabId) {
      throw new Error(tabResult.error || 'Failed to create tab')
    }

    const tabId = tabResult.tabId
    activeState?.runningTabs.add(tabId)

    try {
      // Send scrape message to content script
      const scrapeResponse = await browser.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })

      if (!scrapeResponse?.success) {
        throw new Error(scrapeResponse?.error || 'Scrape failed')
      }

      // Save successful result
      await updateUrlResult(urlResultId, {
        status: 'completed',
        result: scrapeResponse.data,
        completedAt: Date.now(),
      })

      log.debug(`Successfully scraped URL: ${url}`)
    } finally {
      // Clean up tab
      activeState?.runningTabs.delete(tabId)
      await closeHiddenTab(tabId)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error(`Error scraping URL ${url}:`, errorMessage)

    // Check if should retry
    if (retryCount < maxRetries) {
      const delay = calculateRetryDelay(retryCount, 1000)
      log.debug(`Retrying URL ${url} in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`)

      await new Promise((resolve) => setTimeout(resolve, delay))

      // Update retry count and reset to pending
      await updateUrlResult(urlResultId, {
        status: 'pending',
        retryCount: retryCount + 1,
      })

      // Retry
      return scrapeUrl(
        batchId,
        { ...urlResult, retryCount: retryCount + 1 },
        config,
        maxRetries,
        disableJs,
      )
    } else {
      // Max retries exceeded, mark as failed
      await updateUrlResult(urlResultId, {
        status: 'failed',
        error: errorMessage,
        completedAt: Date.now(),
      })
    }
  }
}

/**
 * Pause a batch scrape
 */
export const pauseBatchScrape = async (batchId: string): Promise<void> => {
  try {
    const activeState = activeBatches.get(batchId)
    if (!activeState) {
      log.warn(`Batch ${batchId} is not running`)
      // Even if not in active batches, ensure DB status is paused
      await updateBatchJob(batchId, { status: 'paused' })
      return
    }

    // Update in-memory status first to stop new requests immediately
    activeState.status = 'paused'

    // Resolve the pause signal to immediately unblock any waiting Promise.race
    activeState.pauseSignal.resolve()

    // Then update database status
    await updateBatchJob(batchId, { status: 'paused' })

    // Note: We don't close running tabs anymore - let them finish naturally
    // The running URLs will complete and their status will be updated

    log.debug(
      `Paused batch scrape: ${batchId} (${activeState.runningTabs.size} requests still running)`,
    )
  } catch (error) {
    log.error('Error pausing batch scrape:', error)
    throw error
  }
}

/**
 * Resume a batch scrape
 */
export const resumeBatchScrape = async (batchId: string): Promise<void> => {
  try {
    const batch = await getBatchJob(batchId)
    if (!batch) {
      throw new Error('Batch job not found')
    }

    if (batch.status !== 'paused') {
      throw new Error('Batch is not paused')
    }

    log.debug(`Resuming batch scrape: ${batchId}`)

    // Start the batch scrape but don't wait for it to complete
    // This allows the UI to get an immediate response
    startBatchScrape(batchId).catch((error) => {
      log.error('Error in background batch scrape execution:', error)
    })
  } catch (error) {
    log.error('Error resuming batch scrape:', error)
    throw error
  }
}

/**
 * Retry failed URLs in a batch
 */
export const retryFailedUrls = async (batchId: string): Promise<void> => {
  try {
    const failedResults = await getFailedUrlResults(batchId)

    if (failedResults.length === 0) {
      log.debug('No failed URLs to retry')
      return
    }

    // Reset failed results to pending with retry count reset
    for (const result of failedResults) {
      await updateUrlResult(result.id, {
        status: 'pending',
        retryCount: 0,
        error: undefined,
      })
    }

    log.debug(`Reset ${failedResults.length} failed URLs to pending`)

    // Resume the batch (fire and forget)
    resumeBatchScrape(batchId).catch((error) => {
      log.error('Error resuming batch after retry:', error)
    })
  } catch (error) {
    log.error('Error retrying failed URLs:', error)
    throw error
  }
}

/**
 * Retry a specific URL
 */
export const retryUrl = async (batchId: string, urlResultId: string): Promise<void> => {
  try {
    const batch = await getBatchJob(batchId)
    if (!batch) {
      throw new Error('Batch job not found')
    }

    const urlResult = await batchScrapeDb.urlResults.get(urlResultId)
    if (!urlResult || urlResult.batchId !== batchId) {
      throw new Error('URL result not found')
    }

    // Reset to pending
    await updateUrlResult(urlResultId, {
      status: 'pending',
      retryCount: 0,
      error: undefined,
    })

    // If batch is not running, start it (fire and forget)
    if (!activeBatches.has(batchId)) {
      startBatchScrape(batchId).catch((error) => {
        log.error('Error starting batch after URL retry:', error)
      })
    }
  } catch (error) {
    log.error('Error retrying URL:', error)
    throw error
  }
}
