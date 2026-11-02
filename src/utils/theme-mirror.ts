import log from 'loglevel'

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
 * does not pull in WXT's storage runtime to read it.
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
 * A content script shares `localStorage` with the page it runs on, so only the
 * extension's own pages may hold the copy.
 */
const isExtensionPage = () => location.href.startsWith(browser.runtime.getURL('/'))

/** `localStorage` throws instead of returning when site data is blocked. */
const readThemeMirror = (): Theme | null => {
  try {
    const value = localStorage.getItem(THEME_MIRROR_KEY)
    return isTheme(value) ? value : null
  } catch (error) {
    log.warn('Could not read the mirrored theme', error)
    return null
  }
}

export const writeThemeMirror = (theme: Theme): void => {
  if (!isExtensionPage()) return
  try {
    localStorage.setItem(THEME_MIRROR_KEY, theme)
  } catch (error) {
    log.warn('Could not mirror the theme', error)
  }
}

/**
 * Without a copy (the first page load after install or update), this applies
 * the default theme, as an unset `themeItem` does.
 */
export const applyThemeMirror = (): void => {
  document.documentElement.classList.add(resolveTheme(readThemeMirror() ?? DEFAULT_THEME))
}
