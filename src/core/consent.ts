import log from 'loglevel'

export const ANALYTICS_CONSENT_STORAGE_KEY = 'analytics_consent'

// Consent states: undefined = not asked, true = granted, false = declined
export type ConsentState = boolean | undefined

// Helper to get the raw consent state (including undefined for "not asked")
export const getConsentState = async (): Promise<ConsentState> => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return undefined
    }
    const result = await chrome.storage.local.get([ANALYTICS_CONSENT_STORAGE_KEY])
    return result[ANALYTICS_CONSENT_STORAGE_KEY]
  } catch (error) {
    log.error('Failed to get consent state from storage:', error)
    return undefined
  }
}

// Helper to persist consent – **used only for manual toggling / tests**
export const setConsent = async (value: boolean): Promise<void> => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      throw new Error('chrome.storage is not available')
    }
    await chrome.storage.local.set({ [ANALYTICS_CONSENT_STORAGE_KEY]: value })
  } catch (error) {
    log.error('Failed to set consent in storage:', error)
    throw error
  }
}
