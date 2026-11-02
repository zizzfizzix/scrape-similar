import log from 'loglevel'

// Consent states: undefined = not asked, true = granted, false = declined
export type ConsentState = boolean | undefined

/** Reads a stored consent value, which older versions may have left as `''`. */
export const toConsentState = (value: boolean | string | null): ConsentState =>
  value === '' || value === null ? undefined : !!value

/** Like `getConsentState`, but rejects when storage cannot be read. */
export const readConsentState = async (): Promise<ConsentState> =>
  toConsentState(await analyticsConsentItem.getValue())

// Helper to get the raw consent state (including undefined for "not asked")
export const getConsentState = async (): Promise<ConsentState> => {
  try {
    return await readConsentState()
  } catch (error) {
    log.error('Failed to get consent state from storage:', error)
    return undefined
  }
}

// Helper to persist consent
export const setConsent = async (value: boolean): Promise<void> => {
  try {
    await analyticsConsentItem.setValue(value)
  } catch (error) {
    log.error('Failed to set consent in storage:', error)
    throw error
  }
}
