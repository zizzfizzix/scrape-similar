import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingsIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

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
            <Button variant="ghost" size="icon" aria-label={i18n.t('settings')}>
              <SettingsIcon className="size-5" />
            </Button>
          </DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>{i18n.t('settings')}</TooltipContent>
      </Tooltip>
      <DrawerContent className="w-full right-0 fixed border-l bg-background shadow-lg flex flex-col h-autorounded-lg">
        <DrawerHeader>
          <DrawerTitle onClick={() => settingsRef.current?.unlockDebugMode()}>
            {i18n.t('settings')}
          </DrawerTitle>
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
