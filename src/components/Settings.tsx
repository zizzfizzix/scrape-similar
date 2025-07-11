import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'
import log from 'loglevel'
import { Clipboard } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

interface SettingsProps {
  onResetSystemPresets?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
  className?: string
  onTitleClick?: () => void
  ref?: React.Ref<{ unlockDebugMode: () => void }>
}

export const Settings = React.memo(
  ({
    onResetSystemPresets,
    debugMode = false,
    onDebugModeChange,
    className,
    onTitleClick,
    ref,
  }: SettingsProps) => {
    const [showDebugRow, setShowDebugRow] = useState(debugMode)
    const clickCountRef = useRef(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    // Load debug unlock state from storage on mount
    useEffect(() => {
      if (chrome?.storage?.sync) {
        chrome.storage.sync.get(['debugMode', 'debugUnlocked'], (result) => {
          setShowDebugRow(!!result.debugMode || !!result.debugUnlocked)
        })
      }
    }, [])

    // Listen for debug state changes in storage
    useEffect(() => {
      if (!chrome?.storage?.sync) return

      const handleStorageChange = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string,
      ) => {
        if (areaName === 'sync' && (changes.debugMode || changes.debugUnlocked)) {
          const debugMode = changes.debugMode?.newValue || false
          const debugUnlocked = changes.debugUnlocked?.newValue || false
          setShowDebugRow(debugMode || debugUnlocked)
        }
      }

      chrome.storage.onChanged.addListener(handleStorageChange)

      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange)
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
        if (chrome?.storage?.sync) {
          chrome.storage.sync.set({ debugUnlocked: true })
        }

        // Track hidden settings unlocked
        trackEvent(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
      }
    }

    const handleDebugSwitch = (checked: boolean) => {
      setShowDebugRow(checked)
      if (onDebugModeChange) onDebugModeChange(checked)

      // Clear unlock state when debug mode is turned off
      if (!checked && chrome?.storage?.sync) {
        chrome.storage.sync.remove('debugUnlocked')
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
        await chrome.storage.sync.remove('system_preset_status')
        trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
        if (onResetSystemPresets) onResetSystemPresets()
      } catch (error) {
        log.error('Error resetting system presets:', error)
      }
    }, [onResetSystemPresets])

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
