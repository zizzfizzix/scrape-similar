import { BROWSER_FAMILIES, getBrowserFamily, type BrowserFamily } from '@/utils/browser-family'

interface NonInjectableUrls {
  startsWith: string[]
  match: string[]
}

const CHROME_WEB_STORE: NonInjectableUrls = {
  startsWith: ['https://chromewebstore.google.com/'],
  match: ['^https://chrome\\.google\\.com/(.+/)?webstore/'],
}

// Edge installs from the Chrome Web Store too, so it is refused alongside Edge's own.
const EDGE: NonInjectableUrls = {
  startsWith: [...CHROME_WEB_STORE.startsWith, 'https://microsoftedge.microsoft.com/addons/'],
  match: CHROME_WEB_STORE.match,
}

// Firefox's default extensions.webextensions.restrictedDomains
const FIREFOX: NonInjectableUrls = {
  startsWith: [
    'https://accounts-static.cdn.mozilla.net/',
    'https://accounts.firefox.com/',
    'https://addons.cdn.mozilla.net/',
    'https://addons.mozilla.org/',
    'https://api.accounts.firefox.com/',
    'https://content.cdn.mozilla.net/',
    'https://discovery.addons.mozilla.org/',
    'https://install.mozilla.org/',
    'https://oauth.accounts.firefox.com/',
    'https://profile.accounts.firefox.com/',
    'https://support.mozilla.org/',
    'https://sync.services.mozilla.com/',
  ],
  match: [],
}

const NON_INJECTABLE_URLS: Record<BrowserFamily, NonInjectableUrls> = {
  [BROWSER_FAMILIES.CHROME]: CHROME_WEB_STORE,
  [BROWSER_FAMILIES.EDGE]: EDGE,
  [BROWSER_FAMILIES.FIREFOX]: FIREFOX,
}

/** `chrome://`, `about:`, `data:`; the whole string when it has no scheme. */
const getSchemePrefix = (url: string): string => /^[a-z][a-z\d+.-]*:(\/\/)?/i.exec(url)?.[0] ?? url

/**
 * The prefix or pattern that keeps the content script off `url`, or null when it can run
 * there. The content script and host permissions cover http(s) only, so every other
 * scheme is refused, whichever browser it belongs to.
 */
export const getInjectableUrlPattern = (url?: string): string | null => {
  if (!url) return null
  const scheme = getSchemePrefix(url)
  if (!/^https?:\/\/$/i.test(scheme)) return scheme
  const nonInjectableUrls = NON_INJECTABLE_URLS[getBrowserFamily()]
  return (
    nonInjectableUrls.startsWith.find((prefix) => url.startsWith(prefix)) ??
    nonInjectableUrls.match.find((regex) => url.match(regex)) ??
    null
  )
}

export const isInjectableUrl = (url?: string): boolean =>
  !!url && getInjectableUrlPattern(url) === null
