import '@/assets/tailwind.css'
import SidePanel from '@/entrypoints/sidepanel/SidePanel'
import { isDevOrTest } from '@/utils/modeTest'
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
      return () => unwatch()
    }, [])

    const handleDebugModeChange = (enabled: boolean) => {
      storage.setItem('local:debugMode', enabled)
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
