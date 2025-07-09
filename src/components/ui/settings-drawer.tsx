import { Settings } from '@/components/Settings'
import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'
import { SettingsIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { Button } from './button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from './drawer'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

interface SettingsDrawerProps {
  onResetSystemPresets?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  onResetSystemPresets,
  debugMode,
  onDebugModeChange,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const settingsRef = useRef<{ unlockDebugMode: () => void }>(null)

  // Track settings drawer opened
  useEffect(() => {
    if (isDrawerOpen) {
      trackEvent(ANALYTICS_EVENTS.SETTINGS_OPEN)
    }
  }, [isDrawerOpen])

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Settings">
              <SettingsIcon className="size-5" />
            </Button>
          </DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <DrawerContent className="w-full right-0 fixed border-l bg-background shadow-lg flex flex-col h-autorounded-lg">
        <DrawerHeader>
          <DrawerTitle onClick={() => settingsRef.current?.unlockDebugMode()}>Settings</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 p-4">
          <Settings
            ref={settingsRef}
            onResetSystemPresets={onResetSystemPresets}
            debugMode={debugMode}
            onDebugModeChange={onDebugModeChange}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
