import log from 'loglevel'
import { UUIDTypes, v7 as uuidv7 } from 'uuid'

export type DistinctId = UUIDTypes

// Generate a sortable UUIDv7 (RFC 9562) matching PostHog's internal distinct_id format
export const generateDistinctId = (): DistinctId => uuidv7()

// Retrieve the device ID from chrome.storage.local (or localStorage fallback) or create it if it doesn't exist
export const getOrCreateDistinctId = async (): Promise<DistinctId> => {
  try {
    // Prefer chrome.storage when available (extension contexts)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const storedDistinctId: DistinctId | undefined = await chrome.storage.local
        .get('distinct_id')
        .then((result) => result.distinct_id)

      if (storedDistinctId) {
        return storedDistinctId
      }

      const newDistinctId = generateDistinctId()
      await chrome.storage.local.set({ distinct_id: newDistinctId })
      return newDistinctId
    }

    // Fallback for non-extension environments (e.g., Storybook, tests)
    const stored = localStorage.getItem('distinct_id') as DistinctId | null
    if (stored) {
      return stored
    }

    const newDistinctId = generateDistinctId()
    localStorage.setItem('distinct_id', newDistinctId.toString())
    return newDistinctId
  } catch (err) {
    log.warn('Failed to access storage for distinct_id, generating a new one', err)
    return generateDistinctId()
  }
}
