import { updateStorageItem } from '@/utils/storage-lock'
import log from 'loglevel'
import { type UUIDTypes, v7 as uuidv7 } from 'uuid'

export type DistinctId = UUIDTypes

// Generate a sortable UUIDv7 (RFC 9562) matching PostHog's internal distinct_id format
export const generateDistinctId = (): DistinctId => uuidv7()

// Retrieve the device ID from browser.storage.local (or localStorage fallback) or create it if it doesn't exist
export const getOrCreateDistinctId = async (): Promise<DistinctId> => {
  try {
    // Under the lock, so pages and the background starting together agree on one id.
    return await updateStorageItem(distinctIdItem, (stored) => stored || generateDistinctId())
  } catch (err) {
    // A lock that failed or timed out says nothing about the stored id. A fresh
    // id would file this context's events under a different person.
    const stored = await readStoredDistinctId()
    if (stored) return stored
    log.warn('Failed to access storage for distinct_id, generating a new one', err)
    return generateDistinctId()
  }
}

const readStoredDistinctId = async (): Promise<DistinctId | null> => {
  try {
    return await distinctIdItem.getValue()
  } catch {
    return null
  }
}
