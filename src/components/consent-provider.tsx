import { setConsent as persistConsent } from '@/utils/consent'
import { subscribeWithBackfill } from '@/utils/storage-subscription'
import React, { createContext, useContext, useEffect, useState } from 'react'

interface ConsentValue {
  loading: boolean
  state: ConsentState
  setConsent: (value: boolean) => Promise<void>
}

const ConsentContext = createContext<ConsentValue | undefined>(undefined)

export const ConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [consentState, setConsentState] = useState<ConsentState | null>(null) // null = loading

  useEffect(
    () =>
      // Each state is wrapped because "not asked yet" is `undefined`, and the
      // subscription skips a nullish value.
      subscribeWithBackfill<{ state: ConsentState }>(
        {
          watch: (onChange) =>
            analyticsConsentItem.watch((value) => onChange({ state: toConsentState(value) })),
          read: async () => ({ state: await getConsentState() }),
        },
        ({ state }) => setConsentState(state),
      ),
    [],
  )

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
