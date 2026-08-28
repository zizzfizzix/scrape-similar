/**
 * The main-selector autosuggest list: what it offers, in what order, and how
 * keyboard navigation moves through it.
 *
 * Split out of `ConfigForm.tsx` so the matching and navigation rules can be
 * checked without driving a combobox.
 */

/** Prefix distinguishing a recent-selector entry from a preset id. */
export const RECENT_SUGGESTION_PREFIX = 'recent-'

/** Presets whose name or selector contains `query` (case-insensitive). */
export const filterPresetsByQuery = (presets: Preset[], query: string): Preset[] => {
  const needle = query.toLowerCase().trim()
  if (!needle) return presets

  return presets.filter(
    (preset) =>
      preset.name.toLowerCase().includes(needle) ||
      (preset.config.mainSelector || '').toLowerCase().includes(needle),
  )
}

/**
 * Recently used selectors worth suggesting.
 *
 * Anything a preset already covers is dropped: the preset entry says more (it
 * carries the columns too), so offering both would be a duplicate.
 */
export const filterRecentSelectors = (
  recentSelectors: string[],
  presets: Preset[],
  query: string,
): string[] => {
  const needle = query.toLowerCase().trim()
  const presetSelectors = new Set(
    presets.map((preset) => (preset.config.mainSelector || '').trim()).filter(Boolean),
  )

  return recentSelectors
    .filter((selector) => !presetSelectors.has(selector))
    .filter((selector) => !needle || selector.toLowerCase().includes(needle))
}

/**
 * Ids of every entry in navigation order: recents first, then presets.
 *
 * The ids double as cmdk values, so they must be stable and unique across both
 * groups — hence the prefix on the positional recent ids.
 */
export const buildSuggestionIds = (recentSelectors: string[], presets: Preset[]): string[] => [
  ...recentSelectors.map((_, index) => `${RECENT_SUGGESTION_PREFIX}${index}`),
  ...presets.map((preset) => preset.id),
]

/**
 * Where the highlight moves for one arrow keypress, wrapping at both ends.
 *
 * Returns -1 when there is nothing to highlight.
 */
export const nextSuggestionIndex = (current: number, total: number, delta: 1 | -1): number => {
  if (total === 0) return -1
  if (delta === 1) return current < total - 1 ? current + 1 : 0
  return current > 0 ? current - 1 : total - 1
}

export type ResolvedSuggestion =
  { kind: 'recent'; selector: string } | { kind: 'preset'; preset: Preset }

/** What the entry with id `id` refers to, or null when it refers to nothing. */
export const resolveSuggestion = (
  id: string | undefined,
  recentSelectors: string[],
  presets: Preset[],
): ResolvedSuggestion | null => {
  if (!id) return null

  if (id.startsWith(RECENT_SUGGESTION_PREFIX)) {
    const index = Number.parseInt(id.slice(RECENT_SUGGESTION_PREFIX.length), 10)
    const selector = recentSelectors[index]
    return selector ? { kind: 'recent', selector } : null
  }

  const preset = presets.find((candidate) => candidate.id === id)
  return preset ? { kind: 'preset', preset } : null
}

/** True when `selector` is already stored as a preset, so it needs no recents entry. */
export const isSelectorAPreset = (selector: string, presets: Preset[]): boolean => {
  const needle = selector.trim()
  return presets.some((preset) => (preset.config.mainSelector || '').trim() === needle)
}
