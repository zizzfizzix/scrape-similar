// Detects the current script execution context in the extension

export const EXTENSION_CONTEXTS = {
  CONTENT_SCRIPT: 'content_script',
  BACKGROUND: 'background',
  SIDEPANEL: 'sidepanel',
  POPUP: 'popup',
  OPTIONS: 'options',
  ONBOARDING: 'onboarding',
  FULL_DATA_VIEW: 'full_data_view',
  UNKNOWN: 'unknown',
} as const

export type ExtensionContext = (typeof EXTENSION_CONTEXTS)[keyof typeof EXTENSION_CONTEXTS]

/**
 * Detects if the current script is running in a content script context
 * Content scripts have limited extension API access (no browser.tabs)
 */
export const isContentScript = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    typeof browser !== 'undefined' &&
    typeof browser.runtime !== 'undefined' &&
    typeof browser.tabs === 'undefined'
  )
}

/**
 * Detects if the current script is running in a background context: a service worker on
 * Chromium MV3, or the Firefox background page, which has a `window` of its own.
 * Chromium MV3 has no background page: `extension.getBackgroundPage` returns undefined on
 * its extension pages and is missing in the service worker.
 */
export const isBackgroundContext = (): boolean => {
  if (
    typeof browser === 'undefined' ||
    typeof browser.runtime === 'undefined' ||
    typeof browser.tabs === 'undefined'
  ) {
    return false
  }
  if (typeof window === 'undefined') return typeof self !== 'undefined'
  return (
    typeof browser.extension?.getBackgroundPage === 'function' &&
    browser.extension.getBackgroundPage() === window
  )
}

/**
 * The extension origin differs per browser and per install (`moz-extension://<uuid>` on
 * Firefox), so a page is recognised by the running extension's own URL, not a scheme.
 */
const isOwnExtensionPage = (pathFragment: string): boolean =>
  typeof window !== 'undefined' &&
  window.location.href.startsWith(browser.runtime.getURL('/')) &&
  window.location.pathname.includes(pathFragment)

/**
 * Detects if the current script is running in the sidepanel
 */
export const isSidePanel = (): boolean => {
  return isOwnExtensionPage('sidepanel')
}

/**
 * Detects if the current script is running in a popup
 */
export const isPopup = (): boolean => {
  return isOwnExtensionPage('popup')
}

/**
 * Detects if the current script is running in the options page
 */
export const isOptionsPage = (): boolean => {
  return isOwnExtensionPage('options')
}

export const isOnboardingPage = (): boolean => {
  return isOwnExtensionPage('onboarding')
}

export const isFullDataView = (): boolean => {
  return isOwnExtensionPage('full-data-view')
}

/**
 * Gets the current extension context
 */
export const getCurrentContext = (): ExtensionContext => {
  if (isContentScript()) {
    return EXTENSION_CONTEXTS.CONTENT_SCRIPT
  }

  if (isBackgroundContext()) {
    return EXTENSION_CONTEXTS.BACKGROUND
  }

  if (isSidePanel()) {
    return EXTENSION_CONTEXTS.SIDEPANEL
  }

  if (isPopup()) {
    return EXTENSION_CONTEXTS.POPUP
  }

  if (isOptionsPage()) {
    return EXTENSION_CONTEXTS.OPTIONS
  }

  if (isOnboardingPage()) {
    return EXTENSION_CONTEXTS.ONBOARDING
  }

  if (isFullDataView()) {
    return EXTENSION_CONTEXTS.FULL_DATA_VIEW
  }

  return EXTENSION_CONTEXTS.UNKNOWN
}
