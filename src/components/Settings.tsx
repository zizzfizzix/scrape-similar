import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import log from 'loglevel'
import { Clipboard } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

interface SettingsProps {
  onResetSystemPresets?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
  className?: string
  ref?: React.Ref<{ unlockDebugMode: () => void }>
}

export const Settings = React.memo(
  ({
    onResetSystemPresets,
    debugMode = false,
    onDebugModeChange,
    className,
    ref,
  }: SettingsProps) => {
    const [showDebugRow, setShowDebugRow] = useState(debugMode)
    const { loading: consentLoading, state: consentState, setConsent } = useConsent()
    const clickCountRef = useRef(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Load debug unlock state from storage on mount
    useEffect(() => {
      storage
        .getItems(['local:debugMode', 'local:debugUnlocked'])
        .then(([debugMode, debugUnlocked]) => {
          setShowDebugRow(!!debugMode || !!debugUnlocked)
        })
    }, [])

    // Listen for debug state changes in storage
    useEffect(() => {
      const unwatchDebugMode = storage.watch<boolean>('local:debugMode', (val) => {
        setShowDebugRow((prev) => (val ? true : prev))
      })
      const unwatchDebugUnlocked = storage.watch<boolean>('local:debugUnlocked', (val) => {
        setShowDebugRow((prev) => (val ? true : prev))
      })
      return () => {
        unwatchDebugMode()
        unwatchDebugUnlocked()
      }
    }, [])

    // Handler for clicking the title to unlock debug mode
    const handleTitleClick = () => {
      if (showDebugRow) return
      clickCountRef.current += 1
      if (clickCountRef.current === 1) {
        // Start/reset timer on first click
        timerRef.current = setTimeout(() => {
          clickCountRef.current = 0
        }, 5000)
      }
      if (clickCountRef.current >= 5) {
        setShowDebugRow(true)
        clickCountRef.current = 0
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }

        // Save debug unlock state to storage
        storage.setItem('local:debugUnlocked', true)

        // Track hidden settings unlocked
        trackEvent(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
      }
    }

    const handleDebugSwitch = (checked: boolean) => {
      setShowDebugRow(checked)
      if (onDebugModeChange) onDebugModeChange(checked)

      // Clear unlock state when debug mode is turned off
      if (!checked) {
        storage.removeItem('local:debugUnlocked')
      }

      // Track debug mode toggle
      trackEvent(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, {
        enabled: checked,
      })
    }

    const handleKeyboardShortcutClick = useCallback(() => {
      const url = 'chrome://extensions/shortcuts#:~:text=Scrape%20Similar'
      navigator.clipboard.writeText(url)
      window.open('about:blank', '_blank')

      // Track keyboard shortcut copied
      trackEvent(ANALYTICS_EVENTS.KEYBOARD_SHORTCUT_COPY)
    }, [])

    const handleResetSystemPresets = useCallback(async () => {
      try {
        await storage.removeItem('sync:system_preset_status')
        trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
        if (onResetSystemPresets) onResetSystemPresets()
      } catch (error) {
        log.error('Error resetting system presets:', error)
      }
    }, [onResetSystemPresets])

    const handleAnalyticsToggle = (checked: boolean) => {
      setConsent(checked)
    }

    // Expose the unlock function via ref
    React.useImperativeHandle(ref, () => ({
      unlockDebugMode: handleTitleClick,
    }))

    return (
      <div className={`flex flex-col gap-4 ${className || ''}`}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Theme</span>
          <ModeToggle />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Keyboard shortcut</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                aria-label="Go to Chrome shortcut settings"
                onClick={handleKeyboardShortcutClick}
              >
                <Clipboard className="size-4 ml-1" />
                Copy address
              </Button>
            </TooltipTrigger>
            <TooltipContent>Paste in a new tab to open settings</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">System presets</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetSystemPresets}
            aria-label="Reset system presets"
          >
            Reset
          </Button>
        </div>
        {!consentLoading && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Anonymous analytics</span>
            <Switch checked={consentState === true} onCheckedChange={handleAnalyticsToggle} />
          </div>
        )}
        {showDebugRow && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Debug mode</span>
            <Switch checked={debugMode} onCheckedChange={handleDebugSwitch} />
          </div>
        )}
      </div>
    )
  },
)
