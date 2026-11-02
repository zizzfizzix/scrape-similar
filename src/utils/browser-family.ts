export const BROWSER_FAMILIES = {
  CHROME: 'chrome',
  EDGE: 'edge',
  FIREFOX: 'firefox',
} as const

export type BrowserFamily = (typeof BROWSER_FAMILIES)[keyof typeof BROWSER_FAMILIES]

/**
 * Firefox has a build of its own; Chrome and Edge run the same Chromium build, so only
 * the running browser can tell them apart. Edge's user agent carries `Edg/`.
 */
export const getBrowserFamily = (): BrowserFamily => {
  // eslint-disable-next-line no-restricted-syntax -- the one place the build flag is read
  if (import.meta.env.FIREFOX) return BROWSER_FAMILIES.FIREFOX
  return /\bEdg\//.test(navigator.userAgent) ? BROWSER_FAMILIES.EDGE : BROWSER_FAMILIES.CHROME
}
