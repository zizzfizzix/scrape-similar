import log from 'loglevel'

export const ANALYTICS_CONSENT_STORAGE_KEY = 'analytics_consent'

// Consent states: undefined = not asked, true = granted, false = declined
export type ConsentState = boolean | undefined

// Helper to get the raw consent state (including undefined for "not asked")
export const getConsentState = async (): Promise<ConsentState> => {
  try {
    return (await storage.getItem<boolean>(`local:${ANALYTICS_CONSENT_STORAGE_KEY}`)) ?? undefined
  } catch (error) {
    log.error('Failed to get consent state from storage:', error)
    return undefined
  }
}

// Helper to persist consent – **used only for manual toggling / tests**
export const setConsent = async (value: boolean): Promise<void> => {
  try {
    await storage.setItem(`local:${ANALYTICS_CONSENT_STORAGE_KEY}`, value)
  } catch (error) {
    log.error('Failed to set consent in storage:', error)
    throw error
  }
}
