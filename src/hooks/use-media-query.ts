'use client'

import * as React from 'react'

/**
 * Used for responsive Dialog/Drawer (desktop vs mobile).
 *
 * `matchMedia` is external state, so it is read through `useSyncExternalStore`
 * rather than mirrored into `useState` from an effect: the first render already
 * has the real answer, instead of painting the desktop layout and correcting it.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mediaQuery = window.matchMedia(query)
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    },
    [query],
  )

  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
