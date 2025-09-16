export const isSystemPreset = (preset: Preset) => {
  return SYSTEM_PRESETS.some((p) => p.id === preset.id)
}
