import '@/assets/tailwind.css'
import SidePanel from '@/entrypoints/sidepanel/SidePanel'
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
      storage.getItem<boolean>('sync:debugMode').then((val) => {
        setDebugMode(!!val)
        log.setLevel(val ? 'trace' : 'error')
      })
      const unwatch = storage.watch<boolean>('sync:debugMode', (val) => {
        setDebugMode(!!val)
        log.setLevel(val ? 'trace' : 'error')
      })
      return () => unwatch()
    }, [])

    const handleDebugModeChange = (enabled: boolean) => {
      setDebugMode(enabled)
      log.setLevel(enabled ? 'trace' : 'error')
      storage.setItem('sync:debugMode', enabled)
    }

    return (
      <ThemeProvider>
        <SidePanel debugMode={debugMode} onDebugModeChange={handleDebugModeChange} />
      </ThemeProvider>
    )
  }

  // Create React root and render
  const root = createRoot(appElement)
  root.render(
    <ConsentProvider>
      <PostHogWrapper>
        <SidePanelRoot />
      </PostHogWrapper>
    </ConsentProvider>,
  )
}
