import log from 'loglevel'

// Storage keys
export const STORAGE_KEYS = {
  USER_PRESETS: 'user_presets',
}

// Get presets from storage
export const getPresets = async (): Promise<Preset[]> => {
  try {
    return (await storage.getItem<Preset[]>(`sync:${STORAGE_KEYS.USER_PRESETS}`)) ?? []
  } catch (error) {
    log.error('Error getting presets from storage:', error)
    return []
  }
}

// Save a preset to storage
export const savePreset = async (preset: Preset): Promise<boolean> => {
  try {
    const presets = await getPresets()

    // Check if preset with same ID exists
    const existingIndex = presets.findIndex((p) => p.id === preset.id)
    if (existingIndex !== -1) {
      // Update existing preset
      presets[existingIndex] = preset
    } else {
      // Add new preset
      presets.push(preset)
    }

    await storage.setItem(`sync:${STORAGE_KEYS.USER_PRESETS}`, presets)
    return true
  } catch (error) {
    log.error('Error saving preset to storage:', error)
    return false
  }
}

// Delete a preset from storage
export const deletePreset = async (presetId: string): Promise<boolean> => {
  try {
    const presets = await getPresets()
    const updatedPresets = presets.filter((p) => p.id !== presetId)

    await storage.setItem(`sync:${STORAGE_KEYS.USER_PRESETS}`, updatedPresets)
    return true
  } catch (error) {
    log.error('Error deleting preset from storage:', error)
    return false
  }
}

// Initialize storage with default values
export const initializeStorage = async (): Promise<void> => {
  try {
    const presets = await getPresets()

    // Only initialize if storage is empty
    if (presets.length === 0) {
      await storage.setItem(`sync:${STORAGE_KEYS.USER_PRESETS}`, [])
    }

    // Check if we're in development mode
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      await storage.setItem('local:debugMode', isDev)
      log.debug(`Debug setting forced to ${isDev}`)
    }
  } catch (error) {
    log.error('Error initializing storage:', error)
  }
}

// Get system preset status map from storage
export const getSystemPresetStatus = async (): Promise<SystemPresetStatusMap> => {
  try {
    const result = await storage.getItem<SystemPresetStatusMap>(`sync:${SYSTEM_PRESET_STATUS_KEY}`)
    return result || {}
  } catch (error) {
    log.error('Error getting system preset status from storage:', error)
    return {}
  }
}

// Set system preset status map in storage
export const setSystemPresetStatus = async (statusMap: SystemPresetStatusMap): Promise<void> => {
  try {
    await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, statusMap)
  } catch (error) {
    log.error('Error setting system preset status in storage:', error)
  }
}

// Merge system presets with user presets, respecting status map
export const getAllPresets = async (): Promise<Preset[]> => {
  const [userPresets, statusMap] = await Promise.all([getPresets(), getSystemPresetStatus()])
  // Filter system presets by status (enabled by default)
  const enabledSystemPresets = SYSTEM_PRESETS.filter((preset) => statusMap[preset.id] !== false)
  // Merge: user presets first, then system presets
  return [...userPresets, ...enabledSystemPresets]
}
