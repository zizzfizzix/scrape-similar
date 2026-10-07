import { TooltipProvider } from '@/components/ui/tooltip'
import { SidePanel } from '@/entrypoints/sidepanel/SidePanel'
import { useDebugMode } from '@/hooks/use-debug-mode'
import React from 'react'

/**
 * The side panel plus the debug-mode plumbing it is handed.
 *
 * Split out of `main.tsx` so the flag wiring — which log level a build uses and
 * how the panel writes the flag back — can be exercised without a real root.
 */
export const SidePanelRoot: React.FC = () => {
  const [isDebugModeEnabled, setDebugModeEnabled] = useDebugMode()

  return (
    <ThemeProvider>
      <TooltipProvider>
        <SidePanel debugMode={isDebugModeEnabled} onDebugModeChange={setDebugModeEnabled} />
      </TooltipProvider>
    </ThemeProvider>
  )
}
