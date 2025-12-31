import log from 'loglevel'
import type { PostHog } from 'posthog-js/dist/module.no-external'

export const FEATURE_FLAGS = {
  BATCH_SCRAPE_ENABLED: 'batch_scrape_enabled',
} as const

// Bootstrapped defaults - work immediately without network
export const BOOTSTRAPPED_FLAGS: Record<string, boolean> = {
  [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
}

const FLAGS_STORAGE_KEY = 'local:featureFlags'
const OVERRIDES_STORAGE_KEY = 'local:featureFlagOverrides'

/**
 * Get effective flag value with priority: override > postHog > bootstrap
 */
export async function isFeatureEnabled(flag: string): Promise<boolean> {
  try {
    // 1. Check local overrides first (manual toggles in hidden settings)
    const overrides = (await storage.getItem<Record<string, boolean>>(OVERRIDES_STORAGE_KEY)) ?? {}
    if (flag in overrides) {
      log.debug(`Feature flag '${flag}' resolved from override: ${overrides[flag]}`)
      return overrides[flag]
    }

    // 2. Check persisted PostHog values (survives offline!)
    const flags = (await storage.getItem<Record<string, boolean>>(FLAGS_STORAGE_KEY)) ?? {}
    if (flag in flags) {
      log.debug(`Feature flag '${flag}' resolved from PostHog storage: ${flags[flag]}`)
      return flags[flag]
    }

    // 3. Fall back to hardcoded bootstrap default
    const defaultValue = BOOTSTRAPPED_FLAGS[flag] ?? false
    log.debug(`Feature flag '${flag}' resolved from bootstrap default: ${defaultValue}`)
    return defaultValue
  } catch (error) {
    log.error(`Error reading feature flag '${flag}':`, error)
    return BOOTSTRAPPED_FLAGS[flag] ?? false
  }
}

/**
 * Get all feature flags (for debugging)
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const overrides = (await storage.getItem<Record<string, boolean>>(OVERRIDES_STORAGE_KEY)) ?? {}
    const flags = (await storage.getItem<Record<string, boolean>>(FLAGS_STORAGE_KEY)) ?? {}
    return { ...BOOTSTRAPPED_FLAGS, ...flags, ...overrides }
  } catch (error) {
    log.error('Error getting feature flags:', error)
    return { ...BOOTSTRAPPED_FLAGS }
  }
}

/**
 * Set local override (called from hidden settings)
 * This takes precedence over PostHog values
 */
export async function setFeatureFlagOverride(flag: string, value: boolean): Promise<void> {
  try {
    const overrides = (await storage.getItem<Record<string, boolean>>(OVERRIDES_STORAGE_KEY)) ?? {}
    overrides[flag] = value
    await storage.setItem(OVERRIDES_STORAGE_KEY, overrides)
    log.debug(`Feature flag override set: ${flag} = ${value}`)
  } catch (error) {
    log.error(`Error setting feature flag override '${flag}':`, error)
  }
}

/**
 * Clear override (revert to PostHog-controlled)
 */
export async function clearFeatureFlagOverride(flag: string): Promise<void> {
  try {
    const overrides = (await storage.getItem<Record<string, boolean>>(OVERRIDES_STORAGE_KEY)) ?? {}
    delete overrides[flag]
    await storage.setItem(OVERRIDES_STORAGE_KEY, overrides)
    log.debug(`Feature flag override cleared: ${flag}`)
  } catch (error) {
    log.error(`Error clearing feature flag override '${flag}':`, error)
  }
}

/**
 * Check if flag has local override
 */
export async function hasFeatureFlagOverride(flag: string): Promise<boolean> {
  try {
    const overrides = (await storage.getItem<Record<string, boolean>>(OVERRIDES_STORAGE_KEY)) ?? {}
    return flag in overrides
  } catch (error) {
    log.error(`Error checking feature flag override '${flag}':`, error)
    return false
  }
}

/**
 * Sync PostHog flags to storage (called from onFeatureFlags callback)
 * This persists the server-side flag values so they survive offline sessions
 */
export async function syncFeatureFlagsFromPostHog(posthog: PostHog): Promise<void> {
  try {
    const flags: Record<string, boolean> = {}
    for (const key of Object.keys(BOOTSTRAPPED_FLAGS)) {
      const value = posthog.isFeatureEnabled(key)
      if (value !== undefined) {
        flags[key] = value
      }
    }
    await storage.setItem(FLAGS_STORAGE_KEY, flags)
    log.debug('Feature flags synced from PostHog:', flags)
  } catch (error) {
    log.error('Error syncing feature flags from PostHog:', error)
  }
}

/**
 * Initialize feature flags storage (called on extension install)
 */
export async function initializeFeatureFlags(): Promise<void> {
  try {
    const existingFlags = await storage.getItem<Record<string, boolean>>(FLAGS_STORAGE_KEY)
    if (!existingFlags) {
      await storage.setItem(FLAGS_STORAGE_KEY, {})
      log.debug('Feature flags storage initialized')
    }
  } catch (error) {
    log.error('Error initializing feature flags:', error)
  }
}
