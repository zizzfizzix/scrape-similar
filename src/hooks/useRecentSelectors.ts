import { useEffect, useState } from 'react'

import { getRecentMainSelectors, STORAGE_KEYS } from '@/utils/storage'

/**
 * Hook to manage recent selectors state.
 * Loads and watches for changes to recent main selectors in storage.
 */
export const useRecentSelectors = (): string[] => {
  const [recentSelectors, setRecentSelectors] = useState<string[]>([])

  // Load recent selectors on mount
  useEffect(() => {
    getRecentMainSelectors().then(setRecentSelectors)
  }, [])

  // Watch for changes to recent selectors
  useEffect(() => {
    const unwatch = storage.watch<string[]>(
      `local:${STORAGE_KEYS.RECENT_MAIN_SELECTORS}` as const,
      (list) => setRecentSelectors(Array.isArray(list) ? list : []),
    )

    return unwatch
  }, [])

  return recentSelectors
}
