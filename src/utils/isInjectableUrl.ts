const nonInjectableUrls = {
  startsWith: [
    'chrome://',
    'edge://',
    'about:',
    // eslint-disable-next-line no-restricted-syntax -- every extension's pages are refused
    'chrome-extension://',
    // eslint-disable-next-line no-restricted-syntax -- every extension's pages are refused
    'moz-extension://',
    'view-source:',
    'https://chromewebstore.google.com/',
    // Firefox's default extensions.webextensions.restrictedDomains
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
    'https://microsoftedge.microsoft.com/addons/',
    'file://',
    'ftp://',
    'ftps://',
    'ws://',
    'wss://',
    'blob://',
    'data://',
  ],
  match: ['^https://chrome\\.google\\.com/(.+/)?webstore/'],
}

export const isInjectableUrl = (url?: string): boolean => {
  if (!url) return false
  return (
    !nonInjectableUrls.startsWith.some((prefix) => url.startsWith(prefix)) &&
    !nonInjectableUrls.match.some((regex) => url.match(regex))
  )
}

export const getInjectableUrlPattern = (url?: string): string | null => {
  if (!url) return null
  return (
    nonInjectableUrls.startsWith.find((prefix) => url.startsWith(prefix)) ??
    nonInjectableUrls.match.find((regex) => url.match(regex)) ??
    null
  )
}
