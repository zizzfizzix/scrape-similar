export const isInjectableUrl = (url?: string): boolean => {
  if (!url) return false
  return (
    !url.startsWith('chrome://') &&
    !url.startsWith('https://chromewebstore.google.com/') &&
    !url.match('^https://chrome.google.com/(.+/)?webstore/')
  )
}
