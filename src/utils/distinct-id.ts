import log from 'loglevel'
import { UUIDTypes, v7 as uuidv7 } from 'uuid'

export type DistinctId = UUIDTypes
export const DISTINCT_ID_KEY = 'local:distinct_id'

// Generate a sortable UUIDv7 (RFC 9562) matching PostHog's internal distinct_id format
export const generateDistinctId = (): DistinctId => uuidv7()

// Retrieve the device ID from browser.storage.local (or localStorage fallback) or create it if it doesn't exist
export const getOrCreateDistinctId = async (): Promise<DistinctId> => {
  try {
    const storedDistinctId = await storage.getItem<DistinctId>(DISTINCT_ID_KEY)
    if (storedDistinctId) return storedDistinctId

    const newDistinctId = generateDistinctId()
    await storage.setItem(DISTINCT_ID_KEY, newDistinctId)
    return newDistinctId
  } catch (err) {
    log.warn('Failed to access storage for distinct_id, generating a new one', err)
    return generateDistinctId()
  }
}
