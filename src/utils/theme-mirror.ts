/**
 * A synchronous copy of `themeItem` in the extension origin's `localStorage`.
 *
 * WXT storage only reads asynchronously, so an extension page cannot know the
 * stored theme before its stylesheet paints the background. The `theme-boot`
 * script reads this copy from a render-blocking `<head>` tag instead.
 * `themeItem` stays the source of truth: `ThemeProvider` rewrites the copy
 * whenever it reads or receives the theme, so a stale copy costs one flash and
 * corrects itself on that load.
 */
export const THEME_MIRROR_KEY = 'scrape-similar:theme'

/**
 * `themeItem`'s fallback. Kept here so the render-blocking `theme-boot` bundle
 * does not pull in WXT's storage runtime to read it. This module imports
 * nothing for the same reason; the write, which logs, is in
 * `theme-mirror-write.ts`.
 */
export const DEFAULT_THEME: Theme = 'system'

/** The stored value is whatever was last written there, not necessarily a theme. */
export const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system'

export const resolveTheme = (theme: Theme): Exclude<Theme, 'system'> => {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * `localStorage` throws instead of returning when site data is blocked. A
 * failed read only means the default theme applies until `ThemeProvider` loads
 * the stored one.
 */
const readThemeMirror = (): Theme | null => {
  try {
    const value = localStorage.getItem(THEME_MIRROR_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Without a copy (the first page load after install or update), this applies
 * the default theme, as an unset `themeItem` does.
 */
export const applyThemeMirror = (): void => {
  document.documentElement.classList.add(resolveTheme(readThemeMirror() ?? DEFAULT_THEME))
}
