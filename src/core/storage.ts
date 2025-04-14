/// <reference types="chrome" />
import { Preset } from './types'

// Storage keys
export const STORAGE_KEYS = {
  GLOBAL_PRESETS: 'global_presets',
}

// Get presets from storage
export const getPresets = async (): Promise<Preset[]> => {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.GLOBAL_PRESETS)
    return result[STORAGE_KEYS.GLOBAL_PRESETS] || []
  } catch (error) {
    console.error('Error getting presets from storage:', error)
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

    await chrome.storage.sync.set({ [STORAGE_KEYS.GLOBAL_PRESETS]: presets })
    return true
  } catch (error) {
    console.error('Error saving preset to storage:', error)
    return false
  }
}

// Delete a preset from storage
export const deletePreset = async (presetId: string): Promise<boolean> => {
  try {
    const presets = await getPresets()
    const updatedPresets = presets.filter((p) => p.id !== presetId)

    await chrome.storage.sync.set({ [STORAGE_KEYS.GLOBAL_PRESETS]: updatedPresets })
    return true
  } catch (error) {
    console.error('Error deleting preset from storage:', error)
    return false
  }
}

// Initialize storage with default values
export const initializeStorage = async (): Promise<void> => {
  try {
    const presets = await getPresets()

    // Only initialize if storage is empty
    if (presets.length === 0) {
      await chrome.storage.sync.set({ [STORAGE_KEYS.GLOBAL_PRESETS]: [] })
    }
  } catch (error) {
    console.error('Error initializing storage:', error)
  }
}
