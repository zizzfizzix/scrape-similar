import log from 'loglevel'
import { type UUIDTypes, v7 as uuidv7 } from 'uuid'

export type DistinctId = UUIDTypes

// Generate a sortable UUIDv7 (RFC 9562) matching PostHog's internal distinct_id format
export const generateDistinctId = (): DistinctId => uuidv7()

// Retrieve the device ID from browser.storage.local (or localStorage fallback) or create it if it doesn't exist
export const getOrCreateDistinctId = async (): Promise<DistinctId> => {
  try {
    const storedDistinctId = await distinctIdItem.getValue()
    if (storedDistinctId) return storedDistinctId

    const newDistinctId = generateDistinctId()
    await distinctIdItem.setValue(newDistinctId)
    return newDistinctId
  } catch (err) {
    log.warn('Failed to access storage for distinct_id, generating a new one', err)
    return generateDistinctId()
  }
}
