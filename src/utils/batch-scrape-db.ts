import Dexie, { type EntityTable } from 'dexie'
import log from 'loglevel'
import { v4 as uuidv4 } from 'uuid'

// Interfaces for batch scraping
export interface BatchSettings {
  maxConcurrency: number // Default: 3
  delayBetweenRequests: number // ms, default: 1000
  maxRetries: number // Default: 3
  disableJsRendering: boolean // Default: false
}

export interface BatchScrapeJob {
  id: string // UUID
  name: string // User-provided or auto-generated
  config: ScrapeConfig // The scrape configuration
  urls: string[] // All URLs in batch
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'
  createdAt: number
  updatedAt: number
  settings: BatchSettings // concurrency, delays, retries, etc.
}

export interface BatchScrapeUrlResult {
  id: string // UUID
  batchId: string // Foreign key to BatchScrapeJob
  url: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: ScrapeResult // The scraped data
  error?: string
  retryCount: number
  startedAt?: number
  completedAt?: number
}

// Define the database
class BatchScrapeDatabase extends Dexie {
  // Declare tables
  jobs!: EntityTable<BatchScrapeJob, 'id'>
  urlResults!: EntityTable<BatchScrapeUrlResult, 'id'>

  constructor() {
    super('BatchScrapeDB')

    // Define schema
    this.version(1).stores({
      jobs: 'id, status, createdAt, updatedAt',
      urlResults: 'id, batchId, url, status, startedAt, completedAt',
    })
  }
}

// Singleton instance
const db = new BatchScrapeDatabase()

// Default settings
export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  maxConcurrency: 3,
  delayBetweenRequests: 1000,
  maxRetries: 3,
  disableJsRendering: false,
}

/**
 * Generate a batch name based on URLs
 */
export const generateBatchName = (urls: string[]): string => {
  try {
    const domains = [...new Set(urls.map((u) => new URL(u).hostname))]
    const mainDomain = domains[0] || 'batch'
    const timestamp = new Date().toISOString().split('T')[0]
    const shortId = uuidv4().slice(0, 6) // Use first 6 chars of UUID
    return `${mainDomain} - ${timestamp} - ${shortId}`
  } catch (error) {
    log.error('Error generating batch name:', error)
    const timestamp = new Date().toISOString().split('T')[0]
    const shortId = uuidv4().slice(0, 6)
    return `batch - ${timestamp} - ${shortId}`
  }
}

/**
 * Create a new batch scrape job
 */
export const createBatchJob = async (
  config: ScrapeConfig,
  urls: string[],
  name?: string,
  settings?: Partial<BatchSettings>,
): Promise<BatchScrapeJob> => {
  try {
    const job: BatchScrapeJob = {
      id: uuidv4(),
      name: name || generateBatchName(urls),
      config,
      urls,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: { ...DEFAULT_BATCH_SETTINGS, ...settings },
    }

    await db.jobs.add(job)
    log.debug('Created batch job:', job.id)
    return job
  } catch (error) {
    log.error('Error creating batch job:', error)
    throw error
  }
}

/**
 * Get a batch job by ID
 */
export const getBatchJob = async (id: string): Promise<BatchScrapeJob | undefined> => {
  try {
    return await db.jobs.get(id)
  } catch (error) {
    log.error('Error getting batch job:', error)
    throw error
  }
}

/**
 * Get all batch jobs
 */
export const getAllBatchJobs = async (): Promise<BatchScrapeJob[]> => {
  try {
    return await db.jobs.reverse().sortBy('createdAt')
  } catch (error) {
    log.error('Error getting all batch jobs:', error)
    return []
  }
}

/**
 * Update a batch job
 */
export const updateBatchJob = async (
  id: string,
  updates: Partial<Omit<BatchScrapeJob, 'id'>>,
): Promise<void> => {
  try {
    await db.jobs.update(id, {
      ...updates,
      updatedAt: Date.now(),
    })
    log.debug('Updated batch job:', id)
  } catch (error) {
    log.error('Error updating batch job:', error)
    throw error
  }
}

/**
 * Delete a batch job and all its URL results
 */
export const deleteBatchJob = async (id: string): Promise<void> => {
  try {
    await db.transaction('rw', [db.jobs, db.urlResults], async () => {
      await db.jobs.delete(id)
      await db.urlResults.where('batchId').equals(id).delete()
    })
    log.debug('Deleted batch job and results:', id)
  } catch (error) {
    log.error('Error deleting batch job:', error)
    throw error
  }
}

/**
 * Create URL results for a batch
 */
export const createUrlResults = async (
  batchId: string,
  urls: string[],
): Promise<BatchScrapeUrlResult[]> => {
  try {
    const results: BatchScrapeUrlResult[] = urls.map((url) => ({
      id: uuidv4(),
      batchId,
      url,
      status: 'pending',
      retryCount: 0,
    }))

    await db.urlResults.bulkAdd(results)
    log.debug(`Created ${results.length} URL results for batch:`, batchId)
    return results
  } catch (error) {
    log.error('Error creating URL results:', error)
    throw error
  }
}

/**
 * Get all URL results for a batch
 */
export const getBatchUrlResults = async (batchId: string): Promise<BatchScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where('batchId').equals(batchId).toArray()
  } catch (error) {
    log.error('Error getting batch URL results:', error)
    return []
  }
}

/**
 * Get URL result by ID
 */
export const getUrlResult = async (id: string): Promise<BatchScrapeUrlResult | undefined> => {
  try {
    return await db.urlResults.get(id)
  } catch (error) {
    log.error('Error getting URL result:', error)
    throw error
  }
}

/**
 * Update a URL result
 */
export const updateUrlResult = async (
  id: string,
  updates: Partial<Omit<BatchScrapeUrlResult, 'id' | 'batchId'>>,
): Promise<void> => {
  try {
    await db.urlResults.update(id, updates)
    log.debug('Updated URL result:', id)
  } catch (error) {
    log.error('Error updating URL result:', error)
    throw error
  }
}

/**
 * Get pending URL results for a batch
 */
export const getPendingUrlResults = async (batchId: string): Promise<BatchScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where({ batchId, status: 'pending' }).toArray()
  } catch (error) {
    log.error('Error getting pending URL results:', error)
    return []
  }
}

/**
 * Get failed URL results for a batch
 */
export const getFailedUrlResults = async (batchId: string): Promise<BatchScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where({ batchId, status: 'failed' }).toArray()
  } catch (error) {
    log.error('Error getting failed URL results:', error)
    return []
  }
}

/**
 * Get statistics for a batch
 */
export const getBatchStatistics = async (batchId: string) => {
  try {
    const results = await getBatchUrlResults(batchId)
    return {
      total: results.length,
      pending: results.filter((r) => r.status === 'pending').length,
      running: results.filter((r) => r.status === 'running').length,
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      cancelled: results.filter((r) => r.status === 'cancelled').length,
      totalRows: results
        .filter((r) => r.result?.data)
        .reduce((sum, r) => sum + (r.result?.data.length || 0), 0),
    }
  } catch (error) {
    log.error('Error getting batch statistics:', error)
    return {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      totalRows: 0,
    }
  }
}

/**
 * Get combined results for export
 * Adds URL column to each row
 */
export const getCombinedResults = async (batchId: string): Promise<ScrapedRow[]> => {
  try {
    const results = await db.urlResults
      .where({ batchId, status: 'completed' })
      .filter((r) => r.result !== undefined && r.result.data.length > 0)
      .toArray()

    const combinedRows: ScrapedRow[] = []

    for (const urlResult of results) {
      if (!urlResult.result) continue

      for (const row of urlResult.result.data) {
        combinedRows.push({
          data: {
            url: urlResult.url,
            ...row.data,
          },
          metadata: row.metadata,
        })
      }
    }

    return combinedRows
  } catch (error) {
    log.error('Error getting combined results:', error)
    return []
  }
}

/**
 * Search batch jobs by name or URL
 */
export const searchBatchJobs = async (query: string): Promise<BatchScrapeJob[]> => {
  try {
    const allJobs = await getAllBatchJobs()
    const lowerQuery = query.toLowerCase()

    return allJobs.filter(
      (job) =>
        job.name.toLowerCase().includes(lowerQuery) ||
        job.urls.some((url) => url.toLowerCase().includes(lowerQuery)),
    )
  } catch (error) {
    log.error('Error searching batch jobs:', error)
    return []
  }
}

/**
 * Get batch jobs by status
 */
export const getBatchJobsByStatus = async (
  status: BatchScrapeJob['status'],
): Promise<BatchScrapeJob[]> => {
  try {
    return await db.jobs.where('status').equals(status).reverse().sortBy('createdAt')
  } catch (error) {
    log.error('Error getting batch jobs by status:', error)
    return []
  }
}

/**
 * Get storage usage estimate
 */
export const getStorageUsage = async () => {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentUsed: estimate.quota ? ((estimate.usage || 0) / estimate.quota) * 100 : 0,
      }
    }
    return {
      used: 0,
      quota: 0,
      percentUsed: 0,
    }
  } catch (error) {
    log.error('Error getting storage usage:', error)
    return {
      used: 0,
      quota: 0,
      percentUsed: 0,
    }
  }
}

// Export the database instance for advanced operations
export { db as batchScrapeDb }
