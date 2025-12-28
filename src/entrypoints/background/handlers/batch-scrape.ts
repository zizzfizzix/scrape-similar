import {
  batchScrapeDb,
  getBatchJob,
  getBatchUrlResults,
  getFailedUrlResults,
  getPendingUrlResults,
  updateBatchJob,
  updateUrlResult,
  type BatchScrapeJob,
  type BatchScrapeUrlResult,
} from '@/utils/batch-scrape-db'
import { calculateRetryDelay } from '@/utils/batch-url-utils'
import log from 'loglevel'
import { closeHiddenTab, createHiddenTab } from '../services/hidden-tabs'

// Track active batch scrape sessions
const activeBatches = new Map<
  string,
  {
    status: 'running' | 'paused' | 'cancelled'
    runningTabs: Set<number>
    controller: AbortController
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
    activeBatches.set(batchId, {
      status: 'running',
      runningTabs: new Set(),
      controller,
    })

    // Update batch status
    await updateBatchJob(batchId, { status: 'running' })

    log.debug(`Starting batch scrape: ${batchId}`)

    // Execute the batch scrape
    await executeBatchScrape(batch, controller.signal)

    // Clean up
    activeBatches.delete(batchId)

    // Update final status
    const results = await getBatchUrlResults(batchId)
    const allCompleted = results.every(
      (r) => r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled',
    )
    if (allCompleted) {
      await updateBatchJob(batchId, { status: 'completed' })
    }

    log.debug(`Batch scrape completed: ${batchId}`)
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

    // Wait for at least one to complete
    if (running.length > 0) {
      await Promise.race(running)
    }
  }

  // Wait for all remaining to complete
  await Promise.all(running)
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
      return
    }

    activeState.status = 'paused'
    await updateBatchJob(batchId, { status: 'paused' })

    // Close all running tabs
    for (const tabId of activeState.runningTabs) {
      await closeHiddenTab(tabId)
    }
    activeState.runningTabs.clear()

    // Update running URL results to pending
    const results = await batchScrapeDb.urlResults.where({ batchId, status: 'running' }).toArray()

    for (const result of results) {
      await updateUrlResult(result.id, { status: 'pending' })
    }

    log.debug(`Paused batch scrape: ${batchId}`)
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
    await startBatchScrape(batchId)
  } catch (error) {
    log.error('Error resuming batch scrape:', error)
    throw error
  }
}

/**
 * Cancel a batch scrape
 */
export const cancelBatchScrape = async (batchId: string): Promise<void> => {
  try {
    const activeState = activeBatches.get(batchId)
    if (activeState) {
      activeState.status = 'cancelled'
      activeState.controller.abort()

      // Close all running tabs
      for (const tabId of activeState.runningTabs) {
        await closeHiddenTab(tabId)
      }
      activeState.runningTabs.clear()

      activeBatches.delete(batchId)
    }

    await updateBatchJob(batchId, { status: 'cancelled' })

    // Update pending/running URL results to cancelled
    const results = await batchScrapeDb.urlResults
      .where('batchId')
      .equals(batchId)
      .filter((r) => r.status === 'pending' || r.status === 'running')
      .toArray()

    for (const result of results) {
      await updateUrlResult(result.id, { status: 'cancelled' })
    }

    log.debug(`Cancelled batch scrape: ${batchId}`)
  } catch (error) {
    log.error('Error cancelling batch scrape:', error)
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

    // Resume the batch
    await resumeBatchScrape(batchId)
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

    // If batch is not running, start it
    if (!activeBatches.has(batchId)) {
      await startBatchScrape(batchId)
    }
  } catch (error) {
    log.error('Error retrying URL:', error)
    throw error
  }
}
