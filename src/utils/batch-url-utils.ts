import log from 'loglevel'
import { isInjectableUrl } from './isInjectableUrl'

export interface ValidatedUrls {
  valid: string[]
  invalid: string[]
  duplicatesRemoved: number
}

/**
 * Parse URLs from various input formats
 */
const parseUrls = (input: string): string[] => {
  const lines = input.split(/[\n,]/)
  return lines.map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#')) // Allow # for comments
}

/**
 * Validate a single URL
 */
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Validate and deduplicate URLs
 * Filters out non-injectable URLs and removes duplicates
 */
export const validateAndDeduplicateUrls = (input: string): ValidatedUrls => {
  try {
    const parsedUrls = parseUrls(input)
    const originalCount = parsedUrls.length

    // Track valid and invalid URLs
    const validUrls: string[] = []
    const invalidUrls: string[] = []
    const seenUrls = new Set<string>()

    for (const url of parsedUrls) {
      // Check if valid URL format
      if (!isValidUrl(url)) {
        invalidUrls.push(url)
        continue
      }

      // Check if injectable
      if (!isInjectableUrl(url)) {
        invalidUrls.push(url)
        continue
      }

      // Check for duplicates
      const normalizedUrl = url.toLowerCase()
      if (seenUrls.has(normalizedUrl)) {
        continue // Skip duplicate
      }

      seenUrls.add(normalizedUrl)
      validUrls.push(url)
    }

    const duplicatesRemoved = originalCount - validUrls.length - invalidUrls.length

    log.debug('URL validation results:', {
      total: originalCount,
      valid: validUrls.length,
      invalid: invalidUrls.length,
      duplicatesRemoved,
    })

    return {
      valid: validUrls,
      invalid: invalidUrls,
      duplicatesRemoved,
    }
  } catch (error) {
    log.error('Error validating URLs:', error)
    return {
      valid: [],
      invalid: [],
      duplicatesRemoved: 0,
    }
  }
}

/**
 * Parse URLs from a CSV/TXT file
 */
export const parseUrlsFromFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target?.result as string
      resolve(content)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}

/**
 * Calculate exponential backoff delay with jitter
 */
export const calculateRetryDelay = (retryCount: number, baseDelay: number): number => {
  // Exponential: baseDelay * 2^retryCount with jitter
  const exponentialDelay = baseDelay * Math.pow(2, retryCount)
  const jitter = Math.random() * 1000 // Up to 1 second of jitter
  return exponentialDelay + jitter
}
