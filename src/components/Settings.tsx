import { Button } from '@/components/ui/button'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import log from 'loglevel'
import { Clipboard } from 'lucide-react'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

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

    // Keep local copies of storage flags so we can compute visibility without extra storage reads
    const debugModeValRef = useRef(false)
    const debugUnlockedValRef = useRef(false)

    // Load debug flags from storage on mount
    useEffect(() => {
      storage
        .getItems(['local:debugMode', 'local:debugUnlocked'])
        .then(([debugMode, debugUnlocked]) => {
          debugModeValRef.current = !!debugMode.value
          debugUnlockedValRef.current = !!debugUnlocked.value
          setShowDebugRow(debugModeValRef.current || debugUnlockedValRef.current)
        })
    }, [])

    // Listen for changes to either flag and update visibility
    useEffect(() => {
      const unwatchDebugMode = storage.watch<boolean>('local:debugMode', (val) => {
        debugModeValRef.current = !!val
        setShowDebugRow(debugModeValRef.current || debugUnlockedValRef.current)
      })
      const unwatchDebugUnlocked = storage.watch<boolean>('local:debugUnlocked', (val) => {
        debugUnlockedValRef.current = !!val
        setShowDebugRow(debugModeValRef.current || debugUnlockedValRef.current)
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

    // Generate unique ids for switch components for accessibility
    const analyticsSwitchId = useId()
    const debugSwitchId = useId()
    const themeToggleId = useId()
    const keyboardShortcutId = useId()
    const systemPresetsId = useId()

    // Expose the unlock function via ref
    React.useImperativeHandle(ref, () => ({
      unlockDebugMode: handleTitleClick,
    }))

    return (
      <div className={`flex flex-col gap-4 ${className || ''}`}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${themeToggleId}-label`}>
            {i18n.t('theme')}
          </span>
          <ModeToggle id={themeToggleId} aria-labelledby={`${themeToggleId}-label`} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${keyboardShortcutId}-label`}>
            {i18n.t('keyboardShortcut')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id={keyboardShortcutId}
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                aria-labelledby={`${keyboardShortcutId}-label`}
                onClick={handleKeyboardShortcutClick}
              >
                <Clipboard className="size-4 ml-1" />
                {i18n.t('copyAddress')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{i18n.t('pasteInNewTab')}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${systemPresetsId}-label`}>
            {i18n.t('systemPresets')}
          </span>
          <Button
            id={systemPresetsId}
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetSystemPresets}
            aria-labelledby={`${systemPresetsId}-label`}
          >
            {i18n.t('reset')}
          </Button>
        </div>
        {!consentLoading && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium" id={`${analyticsSwitchId}-label`}>
              {i18n.t('analytics')}
            </span>
            <Switch
              id={analyticsSwitchId}
              aria-labelledby={`${analyticsSwitchId}-label`}
              checked={consentState === true}
              onCheckedChange={handleAnalyticsToggle}
            />
          </div>
        )}
        {showDebugRow && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium" id={`${debugSwitchId}-label`}>
              {i18n.t('debugMode')}
            </span>
            <Switch
              id={debugSwitchId}
              aria-labelledby={`${debugSwitchId}-label`}
              checked={debugMode}
              onCheckedChange={handleDebugSwitch}
            />
          </div>
        )}
      </div>
    )
  },
)
