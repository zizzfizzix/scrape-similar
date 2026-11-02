interface NonInjectableUrls {
  startsWith: string[]
  match: string[]
}

const SHARED_PREFIXES = [
  'chrome://',
  'edge://',
  'about:',
  // eslint-disable-next-line no-restricted-syntax -- every extension's pages are refused
  'chrome-extension://',
  // eslint-disable-next-line no-restricted-syntax -- every extension's pages are refused
  'moz-extension://',
  'view-source:',
  'file://',
  'ftp://',
  'ftps://',
  'ws://',
  'wss://',
  'blob://',
  'data://',
]

// The Chromium build also ships to the Edge store, so it refuses both stores.
const CHROMIUM: NonInjectableUrls = {
  startsWith: [
    ...SHARED_PREFIXES,
    'https://chromewebstore.google.com/',
    'https://microsoftedge.microsoft.com/addons/',
  ],
  match: ['^https://chrome\\.google\\.com/(.+/)?webstore/'],
}

// Firefox's default extensions.webextensions.restrictedDomains
const FIREFOX: NonInjectableUrls = {
  startsWith: [
    ...SHARED_PREFIXES,
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

const getNonInjectableUrls = (): NonInjectableUrls => (import.meta.env.FIREFOX ? FIREFOX : CHROMIUM)

export const isInjectableUrl = (url?: string): boolean => {
  if (!url) return false
  const nonInjectableUrls = getNonInjectableUrls()
  return (
    !nonInjectableUrls.startsWith.some((prefix) => url.startsWith(prefix)) &&
    !nonInjectableUrls.match.some((regex) => url.match(regex))
  )
}

export const getInjectableUrlPattern = (url?: string): string | null => {
  if (!url) return null
  const nonInjectableUrls = getNonInjectableUrls()
  return (
    nonInjectableUrls.startsWith.find((prefix) => url.startsWith(prefix)) ??
    nonInjectableUrls.match.find((regex) => url.match(regex)) ??
    null
  )
}
