import React from 'react'

export const Logo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => {
  const lightLogo = browser.runtime.getURL('/icons/logo-light.svg')
  const darkLogo = browser.runtime.getURL('/icons/logo-dark.svg')

  return (
    <>
      <img src={lightLogo} alt="Scrape Similar" className={`${className} dark:hidden`} />
      <img src={darkLogo} alt="Scrape Similar" className={`${className} hidden dark:block`} />
    </>
  )
}
