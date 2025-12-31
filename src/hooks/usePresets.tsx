import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { isSystemPreset } from '@/utils/isSystemPreset'
import {
  deletePreset,
  getAllPresets,
  getSystemPresetStatus,
  savePreset,
  setSystemPresetStatus,
  STORAGE_KEYS,
} from '@/utils/storage'

interface UsePresetsOptions {
  /** Whether to track analytics events (default: true) */
  trackAnalytics?: boolean
}

interface UsePresetsReturn {
  presets: Preset[]
  getPresetConfig: (preset: Preset) => ScrapeConfig
  handleSavePreset: (name: string, config: ScrapeConfig) => Promise<void>
  handleDeletePreset: (preset: Preset) => Promise<void>
  handleResetSystemPresets: () => Promise<void>
}

/**
 * Hook to manage presets state and operations.
 * Handles loading, watching for changes, saving, deleting, and resetting presets.
 */
export const usePresets = (options: UsePresetsOptions = {}): UsePresetsReturn => {
  const { trackAnalytics = true } = options

  const [presets, setPresets] = useState<Preset[]>([])

  // Load presets on mount
  useEffect(() => {
    getAllPresets().then(setPresets)
  }, [])

  // Watch for preset storage changes
  useEffect(() => {
    const unwatchUserPresets = storage.watch<Preset[]>(
      `sync:${STORAGE_KEYS.USER_PRESETS}` as const,
      () => getAllPresets().then(setPresets),
    )
    const unwatchSystemPresetStatus = storage.watch<Record<string, boolean>>(
      'sync:system_preset_status' as const,
      () => getAllPresets().then(setPresets),
    )

    return () => {
      unwatchUserPresets()
      unwatchSystemPresetStatus()
    }
  }, [])

  // Load preset - returns the config (caller can decide what to do with it)
  const getPresetConfig = useCallback(
    (preset: Preset): ScrapeConfig => {
      if (trackAnalytics) {
        trackEvent(ANALYTICS_EVENTS.PRESET_LOAD, {
          type: isSystemPreset(preset) ? 'system' : 'user',
          preset_name: isSystemPreset(preset) ? preset.name : null,
          preset_id: isSystemPreset(preset) ? preset.id : null,
        })
      }
      return preset.config
    },
    [trackAnalytics],
  )

  // Save preset
  const handleSavePreset = useCallback(
    async (name: string, config: ScrapeConfig) => {
      const preset: Preset = {
        id: Date.now().toString(),
        name,
        config,
        createdAt: Date.now(),
      }
      try {
        const success = await savePreset(preset)
        if (success) {
          const updatedPresets = await getAllPresets()
          setPresets(updatedPresets)

          if (trackAnalytics) {
            trackEvent(ANALYTICS_EVENTS.PRESET_SAVE, {
              type: 'user',
              columns_count: config.columns.length,
            })
          }
        } else {
          toast.error('Failed to save preset')
        }
      } catch (error) {
        toast.error('Failed to save preset')
      }
    },
    [trackAnalytics],
  )

  // Delete preset (or hide system preset)
  const handleDeletePreset = useCallback(
    async (preset: Preset) => {
      if (isSystemPreset(preset)) {
        // Hide system preset by setting enabled=false in status map
        const statusMap = await getSystemPresetStatus()
        statusMap[preset.id] = false
        await setSystemPresetStatus(statusMap)
        toast.success(`System preset "${preset.name}" hidden.`)

        const updatedPresets = await getAllPresets()
        setPresets(updatedPresets)

        if (trackAnalytics) {
          trackEvent(ANALYTICS_EVENTS.PRESET_HIDE, {
            type: 'system',
            preset_name: preset.name,
            preset_id: preset.id,
          })
        }
        return
      }

      // Delete user preset
      try {
        const success = await deletePreset(preset.id)
        if (success) {
          const updatedPresets = await getAllPresets()
          setPresets(updatedPresets)
          toast.success(
            <>
              Preset "<span className="ph_hidden">{preset.name}</span>" deleted
            </>,
          )

          if (trackAnalytics) {
            trackEvent(ANALYTICS_EVENTS.PRESET_DELETION, {
              type: 'user',
            })
          }
        } else {
          toast.error(
            <>
              Error, preset "<span className="ph_hidden">{preset.name}</span>" couldn't be deleted
            </>,
          )
        }
      } catch (error) {
        toast.error('Failed to delete preset')
      }
    },
    [trackAnalytics],
  )

  // Reset (enable) all system presets
  const handleResetSystemPresets = useCallback(async () => {
    await setSystemPresetStatus({})
    const updatedPresets = await getAllPresets()
    setPresets(updatedPresets)
    toast.success('System presets have been reset')

    if (trackAnalytics) {
      trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET, {
        type: 'system',
      })
    }
  }, [trackAnalytics])

  return {
    presets,
    getPresetConfig,
    handleSavePreset,
    handleDeletePreset,
    handleResetSystemPresets,
  }
}
