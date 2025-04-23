import { ThemeProvider } from '@/components/theme-provider'
import SidePanel from '@/sidepanel/SidePanel'
import '@/styles/global.css'
import log from 'loglevel'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
log.setDefaultLevel('error')

// Get the root element
const appElement = document.getElementById('app')
if (!appElement) {
  log.error('Root element not found')
} else {
  const SidePanelRoot = () => {
    const [debugMode, setDebugMode] = useState(false)

    // On startup, set log level and state from storage
    useEffect(() => {
      chrome.storage.sync.get(['debugMode'], (result) => {
        setDebugMode(!!result.debugMode)
        log.setLevel(result.debugMode ? 'trace' : 'error')
      })
      // Listen for debugMode changes in storage
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.debugMode) {
          setDebugMode(!!changes.debugMode.newValue)
          log.setLevel(changes.debugMode.newValue ? 'trace' : 'error')
        }
      })
    }, [])

    const handleDebugModeChange = (enabled: boolean) => {
      setDebugMode(enabled)
      log.setLevel(enabled ? 'trace' : 'error')
      chrome.storage.sync.set({ debugMode: enabled })
    }

    return (
      <ThemeProvider>
        <SidePanel debugMode={debugMode} onDebugModeChange={handleDebugModeChange} />
      </ThemeProvider>
    )
  }

  // Create React root and render
  const root = createRoot(appElement)
  root.render(<SidePanelRoot />)
}
