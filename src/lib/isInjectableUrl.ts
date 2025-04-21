export const isInjectableUrl = (url?: string): boolean => {
  if (!url) return false
  return !url.startsWith('chrome://') && !url.startsWith('https://chromewebstore.google.com/')
}
