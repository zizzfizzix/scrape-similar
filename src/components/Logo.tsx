import React from 'react'

export const Logo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => {
  return (
    <>
      {/* Light mode logo (shown by default, hidden in dark mode) */}
      <img
        src={browser.runtime.getURL('/icons/logo-light.svg')}
        alt="Scrape Similar"
        className={`${className} block dark:hidden`}
      />
      {/* Dark mode logo (hidden by default, shown in dark mode) */}
      <img
        src={browser.runtime.getURL('/icons/logo-dark.svg')}
        alt="Scrape Similar"
        className={`${className} hidden dark:block`}
      />
    </>
  )
}
