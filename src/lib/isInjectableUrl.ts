export const isInjectableUrl = (url?: string): boolean => {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}
