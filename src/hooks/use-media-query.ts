'use client'

import * as React from 'react'

/**
 * React hook that matches a media query and updates when it changes.
 * Used for responsive Dialog/Drawer (desktop vs mobile).
 */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    setValue(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setValue(event.matches)
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return value
}
