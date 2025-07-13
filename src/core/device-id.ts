import log from 'loglevel'
import { UUIDTypes, v7 as uuidv7 } from 'uuid'

export type DeviceId = UUIDTypes

// Generate a sortable UUIDv7 (RFC 9562) matching PostHog's internal device_id format
export const generateDeviceId = (): DeviceId => uuidv7()

// Retrieve the device ID from chrome.storage.local (or localStorage fallback) or create it if it doesn't exist
export const getOrCreateDeviceId = async (): Promise<DeviceId> => {
  try {
    // Prefer chrome.storage when available (extension contexts)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const storedDeviceId: DeviceId | undefined = await chrome.storage.local
        .get('device_id')
        .then((result) => result.device_id)

      if (storedDeviceId) {
        return storedDeviceId
      }

      const newDeviceId = generateDeviceId()
      await chrome.storage.local.set({ device_id: newDeviceId })
      return newDeviceId
    }

    // Fallback for non-extension environments (e.g., Storybook, tests)
    const stored = localStorage.getItem('device_id') as DeviceId | null
    if (stored) {
      return stored
    }

    const newDeviceId = generateDeviceId()
    localStorage.setItem('device_id', newDeviceId.toString())
    return newDeviceId
  } catch (err) {
    log.warn('Failed to access storage for device_id, generating a new one', err)
    return generateDeviceId()
  }
}
