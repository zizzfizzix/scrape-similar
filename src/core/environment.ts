// Environment detection utility for Chrome Extension
// Uses chrome.management.getSelf() to determine if extension is in development mode
// Saves environment to storage on install/update for efficient reuse

import log from 'loglevel'

export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
} as const

export type Environment = (typeof ENVIRONMENT)[keyof typeof ENVIRONMENT]

const STORAGE_KEY = 'extension_environment'

// Cache environment to avoid repeated storage calls
let cachedEnvironment: Environment | null = null
let environmentPromise: Promise<Environment | null> | null = null

/**
 * Detects the current environment using process.env.NODE_ENV
 * Returns a promise that resolves to 'development' or 'production'
 */
const detectEnvironment = (): Promise<Environment> => {
  return new Promise((resolve) => {
    const environment =
      process.env.NODE_ENV === 'development' ? ENVIRONMENT.DEVELOPMENT : ENVIRONMENT.PRODUCTION
    resolve(environment)
  })
}

/**
 * Save environment to storage
 * Should be called on extension install/update
 */
export const saveEnvironmentToStorage = async (): Promise<void> => {
  try {
    const environment = await detectEnvironment()
    await chrome.storage.local.set({ [STORAGE_KEY]: environment })
    log.debug(`Environment saved to storage: ${environment}`)

    // Update cache when saving
    cachedEnvironment = environment
  } catch (error) {
    log.error('Failed to save environment to storage:', error)
    throw error
  }
}

/**
 * Get the current environment from storage
 * Returns null if not found or on error
 */
export const getCurrentEnvironment = async (): Promise<Environment | null> => {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const environment = result[STORAGE_KEY] as Environment | undefined

    if (!environment) {
      log.warn('No environment found in storage - extension may not be properly initialized')
      return null
    }

    return environment
  } catch (error) {
    log.error('Failed to get environment from storage:', error)
    return null
  }
}

/**
 * Get environment with caching to avoid repeated storage calls
 * This is the preferred method for most use cases
 */
export const getCachedEnvironment = async (): Promise<Environment | null> => {
  if (cachedEnvironment !== null) {
    return cachedEnvironment
  }

  if (environmentPromise) {
    return environmentPromise
  }

  environmentPromise = getCurrentEnvironment()
    .then((env) => {
      cachedEnvironment = env
      environmentPromise = null
      return env
    })
    .catch((error) => {
      log.error('Failed to get environment:', error)
      environmentPromise = null
      return null
    })

  return environmentPromise
}
