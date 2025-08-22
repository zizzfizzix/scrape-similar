// Chrome Extension Context Detection Utility
// Reliably detects the current script execution context in a Chrome extension

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
 * Detects if the current script is running in a background context
 * Background scripts are service workers in Manifest V3 or background pages in Manifest V2
 */
export const isBackgroundContext = (): boolean => {
  return (
    typeof self !== 'undefined' &&
    typeof window === 'undefined' &&
    typeof browser !== 'undefined' &&
    typeof browser.runtime !== 'undefined' &&
    typeof browser.tabs !== 'undefined'
  )
}

/**
 * Detects if the current script is running in the sidepanel
 */
export const isSidePanel = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'chrome-extension:' &&
    window.location.pathname.includes('sidepanel')
  )
}

/**
 * Detects if the current script is running in a popup
 */
export const isPopup = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'chrome-extension:' &&
    window.location.pathname.includes('popup')
  )
}

/**
 * Detects if the current script is running in the options page
 */
export const isOptionsPage = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'chrome-extension:' &&
    window.location.pathname.includes('options')
  )
}

export const isOnboardingPage = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'chrome-extension:' &&
    window.location.pathname.includes('onboarding')
  )
}

export const isFullDataView = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window.location.protocol === 'chrome-extension:' &&
    window.location.pathname.includes('full-data-view')
  )
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
