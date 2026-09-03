import React, { createContext, useContext, useEffect, useState } from 'react'
// `storage` is provided globally by WXT
import { setConsent as persistConsent } from '@/utils/consent'

interface ConsentValue {
  loading: boolean
  state: ConsentState
  setConsent: (value: boolean) => Promise<void>
}

const ConsentContext = createContext<ConsentValue | undefined>(undefined)

export const ConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [consentState, setConsentState] = useState<ConsentState | null>(null) // null = loading

  useEffect(() => {
    // initial load from storage
    // `getConsentState` reports its own storage failures and resolves to
    // `undefined`, so there is no rejection to catch here.
    void getConsentState().then(setConsentState)

    const unwatch = storage.watch<boolean | string | null>(
      `sync:${ANALYTICS_CONSENT_STORAGE_KEY}`,
      (value: boolean | string | null) => {
        const sanitizedConsentState: ConsentState =
          value === '' || value == null ? undefined : !!value
        setConsentState(sanitizedConsentState)
      },
    )

    return unwatch
  }, [])

  const setConsent = async (value: boolean): Promise<void> => {
    await persistConsent(value)
    setConsentState(value)
  }

  const contextValue: ConsentValue = {
    loading: consentState === null,
    state: consentState === null ? undefined : consentState,
    setConsent,
  }

  return <ConsentContext.Provider value={contextValue}>{children}</ConsentContext.Provider>
}

export const useConsent = (): ConsentValue => {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be used within <ConsentProvider>')
  return ctx
}
