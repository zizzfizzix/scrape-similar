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
    'https://addons.mozilla.org/',
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
