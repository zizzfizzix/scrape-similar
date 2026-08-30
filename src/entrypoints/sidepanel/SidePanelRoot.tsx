import { TooltipProvider } from '@/components/ui/tooltip'
import { SidePanel } from '@/entrypoints/sidepanel/SidePanel'
import { fireAndForget } from '@/utils/fire-and-forget'
import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'
import React, { useEffect, useState } from 'react'

/**
 * The side panel plus the debug-mode plumbing it is handed.
 *
 * Split out of `main.tsx` so the flag wiring — which log level a build uses and
 * how the panel writes the flag back — can be exercised without a real root.
 */
export const SidePanelRoot: React.FC = () => {
  const [isDebugModeEnabled, setIsDebugModeEnabled] = useState(false)

  useEffect(() => {
    fireAndForget(
      storage.getItem<boolean>('local:debugMode').then((val) => {
        setIsDebugModeEnabled(!!val)
        if (isDevOrTest) {
          log.setLevel('trace')
        } else {
          log.setLevel(val ? 'trace' : 'error')
        }
      }),
    )
    const unwatch = storage.watch<boolean>('local:debugMode', (val) => {
      setIsDebugModeEnabled(!!val)
      if (!isDevOrTest) {
        log.setLevel(val ? 'trace' : 'error')
      }
    })
    return () => unwatch()
  }, [])

  const handleDebugModeChange = (enabled: boolean) => {
    fireAndForget(storage.setItem('local:debugMode', enabled))
  }

  return (
    <ThemeProvider>
      <TooltipProvider>
        <SidePanel debugMode={isDebugModeEnabled} onDebugModeChange={handleDebugModeChange} />
      </TooltipProvider>
    </ThemeProvider>
  )
}
