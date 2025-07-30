import React from 'react'

interface ConsentWrapperProps {
  children: React.ReactNode
  variant?: 'overlay' | 'slide'
  className?: string
}

export const ConsentWrapper: React.FC<ConsentWrapperProps> = ({
  children,
  variant = 'overlay',
  className = '',
}) => {
  const { loading, state: consentState } = useConsent()

  // Wait until the consent state is loaded by the provider
  if (loading) {
    return null
  }

  // Show consent modal if consent is undefined (not asked yet)
  if (consentState === undefined) {
    return <ConsentModal variant={variant} className={className} />
  }

  // Show main content if consent has been decided (true or false)
  return <>{children}</>
}
