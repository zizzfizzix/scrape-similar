import {
  BOOTSTRAPPED_FLAGS,
  clearFeatureFlagOverride,
  FEATURE_FLAGS,
  hasFeatureFlagOverride,
  isFeatureEnabled,
  setFeatureFlagOverride,
  syncFeatureFlagsFromPostHog,
} from '@/utils/feature-flags'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

describe('feature-flags', () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    // Clear storage before each test
    await storage.removeItem('local:featureFlags')
    await storage.removeItem('local:featureFlagOverrides')
  })

  afterEach(async () => {
    await storage.removeItem('local:featureFlags')
    await storage.removeItem('local:featureFlagOverrides')
  })

  describe('BOOTSTRAPPED_FLAGS', () => {
    it('defines default values for all feature flags', () => {
      expect(BOOTSTRAPPED_FLAGS).toHaveProperty(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(typeof BOOTSTRAPPED_FLAGS[FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]).toBe('boolean')
    })

    it('sets batch_scrape_enabled to false by default', () => {
      expect(BOOTSTRAPPED_FLAGS[FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]).toBe(false)
    })
  })

  describe('isFeatureEnabled', () => {
    it('returns bootstrapped value when no overrides or synced flags exist', async () => {
      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(BOOTSTRAPPED_FLAGS[FEATURE_FLAGS.BATCH_SCRAPE_ENABLED])
    })

    it('returns synced PostHog value when no override exists', async () => {
      await storage.setItem('local:featureFlags', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })

      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(true)
    })

    it('returns override value when override exists', async () => {
      // Set PostHog value to true
      await storage.setItem('local:featureFlags', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })

      // Set override to false
      await storage.setItem('local:featureFlagOverrides', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })

      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(false) // Override takes precedence
    })

    it('prioritizes override over synced PostHog value', async () => {
      await storage.setItem('local:featureFlags', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })

      await storage.setItem('local:featureFlagOverrides', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })

      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(true) // Override takes precedence
    })

    it('returns false for unknown flags', async () => {
      const enabled = await isFeatureEnabled('unknown_flag')
      expect(enabled).toBe(false)
    })
  })

  describe('setFeatureFlagOverride', () => {
    it('sets an override value to true', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })
    })

    it('sets an override value to false', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, false)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })
    })

    it('updates existing override value', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, false)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })
    })

    it('preserves other overrides when setting a new one', async () => {
      await storage.setItem('local:featureFlagOverrides', {
        other_flag: true,
      })

      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({
        other_flag: true,
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })
    })
  })

  describe('clearFeatureFlagOverride', () => {
    it('removes an override', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)
      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({})
    })

    it('preserves other overrides when clearing one', async () => {
      await storage.setItem('local:featureFlagOverrides', {
        other_flag: true,
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })

      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({
        other_flag: true,
      })
    })

    it('does nothing when override does not exist', async () => {
      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)

      const overrides = await storage.getItem<Record<string, boolean>>('local:featureFlagOverrides')
      expect(overrides).toEqual({})
    })
  })

  describe('hasFeatureFlagOverride', () => {
    it('returns false when no override exists', async () => {
      const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(hasOverride).toBe(false)
    })

    it('returns true when override exists (true)', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)

      const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(hasOverride).toBe(true)
    })

    it('returns true when override exists (false)', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, false)

      const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(hasOverride).toBe(true)
    })

    it('returns false after clearing override', async () => {
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, true)
      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)

      const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(hasOverride).toBe(false)
    })
  })

  describe('syncFeatureFlagsFromPostHog', () => {
    it('syncs feature flags from PostHog instance to storage', async () => {
      const mockPostHog = {
        isFeatureEnabled: vi.fn((flag: string) => {
          if (flag === FEATURE_FLAGS.BATCH_SCRAPE_ENABLED) return true
          return undefined
        }),
      } as any

      await syncFeatureFlagsFromPostHog(mockPostHog)

      const flags = await storage.getItem<Record<string, boolean>>('local:featureFlags')
      expect(flags).toEqual({
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })
    })

    it('only syncs flags defined in BOOTSTRAPPED_FLAGS', async () => {
      const mockPostHog = {
        isFeatureEnabled: vi.fn((flag: string) => {
          // Return true for all flags, including ones not in our system
          return true
        }),
      } as any

      await syncFeatureFlagsFromPostHog(mockPostHog)

      const flags = await storage.getItem<Record<string, boolean>>('local:featureFlags')
      // Should only have flags from BOOTSTRAPPED_FLAGS
      expect(Object.keys(flags || {})).toEqual(Object.keys(BOOTSTRAPPED_FLAGS))
    })

    it('handles undefined values from PostHog', async () => {
      const mockPostHog = {
        isFeatureEnabled: vi.fn(() => undefined),
      } as any

      await syncFeatureFlagsFromPostHog(mockPostHog)

      const flags = await storage.getItem<Record<string, boolean>>('local:featureFlags')
      // Should not include flags with undefined values
      expect(flags).toEqual({})
    })

    it('updates existing synced flags', async () => {
      // Set initial value
      await storage.setItem('local:featureFlags', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: false,
      })

      // Sync new value from PostHog
      const mockPostHog = {
        isFeatureEnabled: vi.fn(() => true),
      } as any

      await syncFeatureFlagsFromPostHog(mockPostHog)

      const flags = await storage.getItem<Record<string, boolean>>('local:featureFlags')
      expect(flags).toEqual({
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })
    })
  })

  describe('flag precedence integration', () => {
    it('follows correct precedence: override > synced > bootstrapped', async () => {
      // 1. No data - should use bootstrapped
      let enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(BOOTSTRAPPED_FLAGS[FEATURE_FLAGS.BATCH_SCRAPE_ENABLED])

      // 2. Add synced value - should use synced
      await storage.setItem('local:featureFlags', {
        [FEATURE_FLAGS.BATCH_SCRAPE_ENABLED]: true,
      })
      enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(true)

      // 3. Add override - should use override
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, false)
      enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(false)

      // 4. Clear override - should revert to synced
      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(true)

      // 5. Clear synced - should revert to bootstrapped
      await storage.removeItem('local:featureFlags')
      enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      expect(enabled).toBe(BOOTSTRAPPED_FLAGS[FEATURE_FLAGS.BATCH_SCRAPE_ENABLED])
    })
  })
})
