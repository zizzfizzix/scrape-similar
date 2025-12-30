import Dexie, { type EntityTable } from 'dexie'
import log from 'loglevel'
import { v4 as uuidv4 } from 'uuid'

// Interfaces for scraping (both single and batch)
export interface ScrapeSettings {
  maxConcurrency: number // Default: 3
  delayBetweenRequests: number // ms, default: 1000
  maxRetries: number // Default: 3
  disableJsRendering: boolean // Default: false
}

export interface ScrapeStatistics {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
  cancelled: number
  totalRows: number
}

export interface ScrapeJob {
  id: string // UUID
  name: string // User-provided or auto-generated
  tabId?: number // If set: single/ephemeral scrape. If null: batch/persistent scrape
  config: ScrapeConfig // The scrape configuration
  urls: string[] // All URLs (single scrapes: array of 1)
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'
  createdAt: number
  updatedAt: number
  settings: ScrapeSettings // concurrency, delays, retries, etc.
  statistics: ScrapeStatistics // Pre-computed statistics (materialized view)
}

export interface ScrapeUrlResult {
  id: string // UUID
  jobId: string // Foreign key to ScrapeJob
  url: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: ScrapeResult // The scraped data
  error?: string
  retryCount: number
  startedAt?: number
  completedAt?: number
}

// Define the database
class ScrapeDatabase extends Dexie {
  // Declare tables
  jobs!: EntityTable<ScrapeJob, 'id'>
  urlResults!: EntityTable<ScrapeUrlResult, 'id'>

  constructor() {
    super('ScrapeDB')

    // Version 1: Initial schema
    this.version(1).stores({
      jobs: 'id, status, createdAt, updatedAt',
      urlResults: 'id, jobId, url, status, startedAt, completedAt',
    })

    // Version 2: Add statistics field to jobs (materialized view pattern)
    this.version(2)
      .stores({
        jobs: 'id, status, createdAt, updatedAt',
        urlResults: 'id, jobId, url, status, startedAt, completedAt',
      })
      .upgrade(async (tx) => {
        // Populate statistics for existing jobs
        const jobs = await tx.table('jobs').toArray()
        for (const job of jobs) {
          const urlResults = await tx.table('urlResults').where('jobId').equals(job.id).toArray()

          const statistics: ScrapeStatistics = {
            total: urlResults.length,
            pending: urlResults.filter((r: any) => r.status === 'pending').length,
            running: urlResults.filter((r: any) => r.status === 'running').length,
            completed: urlResults.filter((r: any) => r.status === 'completed').length,
            failed: urlResults.filter((r: any) => r.status === 'failed').length,
            cancelled: urlResults.filter((r: any) => r.status === 'cancelled').length,
            totalRows: urlResults
              .filter((r: any) => r.result?.data)
              .reduce((sum: number, r: any) => sum + (r.result?.data.length || 0), 0),
          }

          await tx.table('jobs').update(job.id, { statistics })
        }
        log.info('Database upgraded to v2: Added statistics to scrape jobs')
      })

    // Version 3: Add tabId field for single scrapes (ephemeral scrapes tied to tabs)
    this.version(3).stores({
      jobs: 'id, status, createdAt, updatedAt, tabId',
      urlResults: 'id, jobId, url, status, startedAt, completedAt',
    })
  }
}

// Singleton instance
const db = new ScrapeDatabase()

// Default settings
export const DEFAULT_SCRAPE_SETTINGS: ScrapeSettings = {
  maxConcurrency: 3,
  delayBetweenRequests: 1000,
  maxRetries: 3,
  disableJsRendering: false,
}

/**
 * Generate a job name based on URLs
 */
export const generateJobName = (urls: string[]): string => {
  try {
    const domains = [...new Set(urls.map((u) => new URL(u).hostname))]
    const mainDomain = domains[0] || 'scrape'
    const timestamp = new Date().toISOString().split('T')[0]
    const shortId = uuidv4().slice(0, 6) // Use first 6 chars of UUID
    return `${mainDomain} - ${timestamp} - ${shortId}`
  } catch (error) {
    log.error('Error generating job name:', error)
    const timestamp = new Date().toISOString().split('T')[0]
    const shortId = uuidv4().slice(0, 6)
    return `scrape - ${timestamp} - ${shortId}`
  }
}

/**
 * Create a new scrape job
 */
export const createScrapeJob = async (
  config: ScrapeConfig,
  urls: string[],
  name?: string,
  settings?: Partial<ScrapeSettings>,
  tabId?: number,
): Promise<ScrapeJob> => {
  try {
    const job: ScrapeJob = {
      id: uuidv4(),
      name: name || generateJobName(urls),
      tabId,
      config,
      urls,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: { ...DEFAULT_SCRAPE_SETTINGS, ...settings },
      statistics: {
        total: urls.length,
        pending: urls.length,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        totalRows: 0,
      },
    }

    await db.jobs.add(job)
    log.debug('Created scrape job:', job.id)
    return job
  } catch (error) {
    log.error('Error creating scrape job:', error)
    throw error
  }
}

/**
 * Get a scrape job by ID
 */
export const getScrapeJob = async (id: string): Promise<ScrapeJob | undefined> => {
  try {
    return await db.jobs.get(id)
  } catch (error) {
    log.error('Error getting scrape job:', error)
    throw error
  }
}

/**
 * Get all scrape jobs
 */
export const getAllScrapeJobs = async (): Promise<ScrapeJob[]> => {
  try {
    return await db.jobs.reverse().sortBy('createdAt')
  } catch (error) {
    log.error('Error getting all scrape jobs:', error)
    return []
  }
}

/**
 * Update a scrape job
 */
export const updateScrapeJob = async (
  id: string,
  updates: Partial<Omit<ScrapeJob, 'id'>>,
): Promise<void> => {
  try {
    await db.jobs.update(id, {
      ...updates,
      updatedAt: Date.now(),
    })
    log.debug('Updated scrape job:', id)
  } catch (error) {
    log.error('Error updating scrape job:', error)
    throw error
  }
}

/**
 * Delete a scrape job and all its URL results
 */
export const deleteScrapeJob = async (id: string): Promise<void> => {
  try {
    await db.transaction('rw', [db.jobs, db.urlResults], async () => {
      await db.jobs.delete(id)
      await db.urlResults.where('jobId').equals(id).delete()
    })
    log.debug('Deleted scrape job and results:', id)
  } catch (error) {
    log.error('Error deleting scrape job:', error)
    throw error
  }
}

/**
 * Create URL results for a job
 */
export const createUrlResults = async (
  jobId: string,
  urls: string[],
): Promise<ScrapeUrlResult[]> => {
  try {
    const results: ScrapeUrlResult[] = urls.map((url) => ({
      id: uuidv4(),
      jobId,
      url,
      status: 'pending',
      retryCount: 0,
    }))

    await db.urlResults.bulkAdd(results)
    log.debug(`Created ${results.length} URL results for job:`, jobId)
    return results
  } catch (error) {
    log.error('Error creating URL results:', error)
    throw error
  }
}

/**
 * Get all URL results for a job
 */
export const getJobUrlResults = async (jobId: string): Promise<ScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where('jobId').equals(jobId).toArray()
  } catch (error) {
    log.error('Error getting job URL results:', error)
    return []
  }
}

/**
 * Get URL result by ID
 */
export const getUrlResult = async (id: string): Promise<ScrapeUrlResult | undefined> => {
  try {
    return await db.urlResults.get(id)
  } catch (error) {
    log.error('Error getting URL result:', error)
    throw error
  }
}

/**
 * Update a URL result and recompute job statistics
 */
export const updateUrlResult = async (
  id: string,
  updates: Partial<Omit<ScrapeUrlResult, 'id' | 'jobId'>>,
): Promise<void> => {
  try {
    // Get the URL result to find its job ID
    const urlResult = await db.urlResults.get(id)
    if (!urlResult) {
      throw new Error('URL result not found')
    }

    // Update the URL result
    await db.urlResults.update(id, updates)
    log.debug('Updated URL result:', id)

    // Recompute and update job statistics
    await updateJobStatistics(urlResult.jobId)
  } catch (error) {
    log.error('Error updating URL result:', error)
    throw error
  }
}

/**
 * Recompute and update job statistics
 * This is called automatically after any URL result change
 */
export const updateJobStatistics = async (jobId: string): Promise<void> => {
  try {
    const urlResults = await db.urlResults.where('jobId').equals(jobId).toArray()

    const statistics: ScrapeStatistics = {
      total: urlResults.length,
      pending: urlResults.filter((r) => r.status === 'pending').length,
      running: urlResults.filter((r) => r.status === 'running').length,
      completed: urlResults.filter((r) => r.status === 'completed').length,
      failed: urlResults.filter((r) => r.status === 'failed').length,
      cancelled: urlResults.filter((r) => r.status === 'cancelled').length,
      totalRows: urlResults
        .filter((r) => r.result?.data)
        .reduce((sum, r) => sum + (r.result?.data.length || 0), 0),
    }

    await db.jobs.update(jobId, { statistics, updatedAt: Date.now() })
    log.debug('Updated job statistics:', jobId, statistics)
  } catch (error) {
    log.error('Error updating job statistics:', error)
    // Don't throw - statistics update failure shouldn't break the main flow
  }
}

/**
 * Get pending URL results for a job
 */
export const getPendingUrlResults = async (jobId: string): Promise<ScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where({ jobId, status: 'pending' }).toArray()
  } catch (error) {
    log.error('Error getting pending URL results:', error)
    return []
  }
}

/**
 * Get failed URL results for a job
 */
export const getFailedUrlResults = async (jobId: string): Promise<ScrapeUrlResult[]> => {
  try {
    return await db.urlResults.where({ jobId, status: 'failed' }).toArray()
  } catch (error) {
    log.error('Error getting failed URL results:', error)
    return []
  }
}

/**
 * Get combined results for export
 * Adds URL column to each row
 */
export const getCombinedResults = async (jobId: string): Promise<ScrapedRow[]> => {
  try {
    const results = await db.urlResults
      .where({ jobId, status: 'completed' })
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
 * Search scrape jobs by name or URL
 */
export const searchScrapeJobs = async (query: string): Promise<ScrapeJob[]> => {
  try {
    const allJobs = await getAllScrapeJobs()
    const lowerQuery = query.toLowerCase()

    return allJobs.filter(
      (job) =>
        job.name.toLowerCase().includes(lowerQuery) ||
        job.urls.some((url) => url.toLowerCase().includes(lowerQuery)),
    )
  } catch (error) {
    log.error('Error searching scrape jobs:', error)
    return []
  }
}

/**
 * Get scrape jobs by status
 */
export const getScrapeJobsByStatus = async (status: ScrapeJob['status']): Promise<ScrapeJob[]> => {
  try {
    return await db.jobs.where('status').equals(status).reverse().sortBy('createdAt')
  } catch (error) {
    log.error('Error getting scrape jobs by status:', error)
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

// ============================================================================
// Single Scrape Helpers
// ============================================================================

/**
 * Get scrape job for a specific tab
 * Returns the most recent job associated with the tab
 */
export const getScrapeJobForTab = async (tabId: number): Promise<ScrapeJob | undefined> => {
  try {
    const jobs = await db.jobs.where('tabId').equals(tabId).reverse().sortBy('createdAt')
    return jobs[0] // Return most recent
  } catch (error) {
    log.error('Error getting scrape job for tab:', error)
    return undefined
  }
}

/**
 * Promote a scrape job to persistent (remove tabId)
 * This prevents it from being auto-cleaned up when the tab closes
 */
export const promoteScrapeJob = async (id: string): Promise<void> => {
  try {
    await db.jobs.update(id, { tabId: undefined, updatedAt: Date.now() })
    log.debug('Promoted scrape job to persistent:', id)
  } catch (error) {
    log.error('Error promoting scrape job:', error)
    throw error
  }
}

/**
 * Get all single scrape jobs (jobs with tabId set)
 */
export const getSingleScrapeJobs = async (): Promise<ScrapeJob[]> => {
  try {
    return await db.jobs
      .filter((job) => job.tabId !== undefined)
      .reverse()
      .sortBy('createdAt')
  } catch (error) {
    log.error('Error getting single scrape jobs:', error)
    return []
  }
}

/**
 * Get all batch scrape jobs (jobs without tabId)
 */
export const getBatchScrapeJobs = async (): Promise<ScrapeJob[]> => {
  try {
    return await db.jobs
      .filter((job) => job.tabId === undefined)
      .reverse()
      .sortBy('createdAt')
  } catch (error) {
    log.error('Error getting batch scrape jobs:', error)
    return []
  }
}

// ============================================================================
// Live Query Functions (for use with useLiveQuery from dexie-react-hooks)
// ============================================================================
// These functions return promises that useLiveQuery can observe for changes

/**
 * Live query: Get a scrape job by ID
 * For use with useLiveQuery - automatically updates when job changes
 */
export const liveGetScrapeJob = (id: string) => {
  return db.jobs.get(id)
}

/**
 * Live query: Get all scrape jobs
 * For use with useLiveQuery - automatically updates when any job changes
 */
export const liveGetAllScrapeJobs = () => {
  return db.jobs.reverse().sortBy('createdAt')
}

/**
 * Live query: Get all URL results for a job
 * For use with useLiveQuery - automatically updates when URL results change
 */
export const liveGetJobUrlResults = (jobId: string) => {
  return db.urlResults.where('jobId').equals(jobId).toArray()
}

/**
 * Live query: Get combined results for a job
 * For use with useLiveQuery - automatically updates when completed results change
 */
export const liveGetCombinedResults = async (jobId: string) => {
  const results = await db.urlResults
    .where({ jobId, status: 'completed' })
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
}

/**
 * Live query: Get scrape job for a specific tab
 * For use with useLiveQuery - automatically updates when tab's job changes
 */
export const liveGetScrapeJobForTab = async (tabId: number) => {
  const jobs = await db.jobs.where('tabId').equals(tabId).reverse().sortBy('createdAt')
  return jobs[0] // Return most recent
}

/**
 * Live query: Get scrape result for a specific tab
 * Returns the first URL result's scrape data (single scrapes have only one URL)
 */
export const liveGetScrapeResultForTab = async (tabId: number) => {
  const job = await liveGetScrapeJobForTab(tabId)
  if (!job) return null

  const urlResults = await db.urlResults.where('jobId').equals(job.id).toArray()
  if (urlResults.length === 0) return null

  const firstResult = urlResults[0]
  if (!firstResult.result) return null

  return {
    result: firstResult.result,
    config: job.config,
  }
}

/**
 * Live query: Get all single scrape jobs
 * For use with useLiveQuery - automatically updates when single scrapes change
 */
export const liveGetSingleScrapeJobs = async () => {
  return await db.jobs
    .filter((job) => job.tabId !== undefined)
    .reverse()
    .sortBy('createdAt')
}

// Export the database instance for advanced operations
export { db as scrapeDb }

// ============================================================================
// LEGACY EXPORTS (for backwards compatibility during migration)
// ============================================================================
// These will be removed once all imports are updated

export type BatchSettings = ScrapeSettings
export type BatchStatistics = ScrapeStatistics
export type BatchScrapeJob = ScrapeJob
export type BatchScrapeUrlResult = ScrapeUrlResult

export const DEFAULT_BATCH_SETTINGS = DEFAULT_SCRAPE_SETTINGS
export const generateBatchName = generateJobName
export const createBatchJob = createScrapeJob
export const getBatchJob = getScrapeJob
export const getAllBatchJobs = getAllScrapeJobs
export const updateBatchJob = updateScrapeJob
export const deleteBatchJob = deleteScrapeJob
export const getBatchUrlResults = getJobUrlResults
export const updateBatchStatistics = updateJobStatistics
export const searchBatchJobs = searchScrapeJobs
export const getBatchJobsByStatus = getScrapeJobsByStatus
export const liveGetBatchJob = liveGetScrapeJob
export const liveGetAllBatchJobs = liveGetAllScrapeJobs
export const liveGetBatchUrlResults = liveGetJobUrlResults
export const batchScrapeDb = db
