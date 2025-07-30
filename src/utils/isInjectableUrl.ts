const nonInjectableUrls = {
  startsWith: ['chrome://', 'about:', 'chrome-extension://', 'https://chromewebstore.google.com/'],
  match: ['^https://chrome.google.com/(.+/)?webstore/'],
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
