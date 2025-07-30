import log from 'loglevel'

export const ANALYTICS_CONSENT_STORAGE_KEY = 'analytics_consent'

// Consent states: undefined = not asked, true = granted, false = declined
export type ConsentState = boolean | undefined

// Helper to get the raw consent state (including undefined for "not asked")
export const getConsentState = async (): Promise<ConsentState> => {
  try {
    const value = await storage.getItem<boolean | null | string>(
      `sync:${ANALYTICS_CONSENT_STORAGE_KEY}`,
    )
    const sanitizedConsentState =
      value === '' || value === null || value === undefined ? undefined : !!value
    return sanitizedConsentState
  } catch (error) {
    log.error('Failed to get consent state from storage:', error)
    return undefined
  }
}

// Helper to persist consent
export const setConsent = async (value: boolean): Promise<void> => {
  try {
    await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, value)
  } catch (error) {
    log.error('Failed to set consent in storage:', error)
    throw error
  }
}
