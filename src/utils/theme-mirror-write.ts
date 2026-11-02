import { THEME_MIRROR_KEY } from '@/utils/theme-mirror'
import log from 'loglevel'

/**
 * A content script shares `localStorage` with the page it runs on, so only the
 * extension's own pages may hold the copy.
 */
const isExtensionPage = () => location.href.startsWith(browser.runtime.getURL('/'))

/**
 * `getURL` throws in a content script whose extension has been reloaded, so the
 * page check sits inside the `try` with the write.
 */
export const writeThemeMirror = (theme: Theme): void => {
  try {
    if (!isExtensionPage()) return
    localStorage.setItem(THEME_MIRROR_KEY, theme)
  } catch (error) {
    log.warn('Could not mirror the theme', error)
  }
}
