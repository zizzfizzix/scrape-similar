import log from 'loglevel'
import React, { useEffect, useRef, useState } from 'react'

const OptionsApp: React.FC = () => {
  const [debugMode, setDebugMode] = useState(false)
  const { theme } = useTheme()
  const settingsRef = useRef<{ unlockDebugMode: () => void }>(null)

  // Load debug mode from storage on mount
  useEffect(() => {
    const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

    storage.getItem<boolean>('local:debugMode').then((val) => {
      setDebugMode(!!val)
      if (isDevOrTest) {
        log.setLevel('trace')
      } else {
        log.setLevel(val ? 'trace' : 'error')
      }
    })

    const unwatch = storage.watch<boolean>('local:debugMode', (val) => {
      setDebugMode(!!val)
      if (!isDevOrTest) {
        log.setLevel(val ? 'trace' : 'error')
      }
    })

    return () => {
      unwatch()
    }
  }, [])

  const handleDebugModeChange = (enabled: boolean) => {
    setDebugMode(enabled)
    storage.setItem('local:debugMode', enabled)
  }

  const handleTitleClick = () => {
    settingsRef.current?.unlockDebugMode()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ConsentWrapper>
        <div className="flex-1 p-4">
          <div className="w-full max-w-2xl mx-auto pt-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={theme === 'dark' ? '/icons/logo-dark.svg' : '/icons/logo-light.svg'}
                    alt="Scrape Similar Logo"
                    className="w-8 h-8"
                  />
                  <h1 className="text-3xl font-bold" onClick={handleTitleClick}>
                    Settings
                  </h1>
                </div>
                <p className="text-muted-foreground">Tailor Scrape Similar configuration</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-card border rounded-lg p-6">
                <Settings
                  ref={settingsRef}
                  debugMode={debugMode}
                  onDebugModeChange={handleDebugModeChange}
                />
              </div>
            </div>
          </div>
        </div>
      </ConsentWrapper>
      <Footer />
    </div>
  )
}

export default OptionsApp
