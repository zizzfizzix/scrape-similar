import { Settings } from '@/components/Settings'
import { useTheme } from '@/components/theme-provider'
import { Footer } from '@/components/ui/footer'
import log from 'loglevel'
import React, { useEffect, useState } from 'react'

const OptionsApp: React.FC = () => {
  const [debugMode, setDebugMode] = useState(false)
  const { theme } = useTheme()

  // Load debug mode from storage on mount
  useEffect(() => {
    chrome.storage.sync.get(['debugMode'], (result) => {
      setDebugMode(!!result.debugMode)
      log.setLevel(result.debugMode ? 'trace' : 'error')
    })

    // Listen for debugMode changes in storage
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'sync' && changes.debugMode) {
        setDebugMode(!!changes.debugMode.newValue)
        log.setLevel(changes.debugMode.newValue ? 'trace' : 'error')
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  const handleDebugModeChange = (enabled: boolean) => {
    setDebugMode(enabled)
    chrome.storage.sync.set({ debugMode: enabled })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                <h1 className="text-3xl font-bold">Settings</h1>
              </div>
              <p className="text-muted-foreground">Tailor Scrape Similar configuration</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card border rounded-lg p-6">
              <Settings debugMode={debugMode} onDebugModeChange={handleDebugModeChange} />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

export default OptionsApp
