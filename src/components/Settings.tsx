import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  clearFeatureFlagOverride,
  FEATURE_FLAGS,
  hasFeatureFlagOverride,
  isFeatureEnabled,
  setFeatureFlagOverride,
} from '@/utils/feature-flags'
import log from 'loglevel'
import { ChevronDown, ChevronRight, ChevronsUpDown, Clipboard } from 'lucide-react'
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
    const [batchScrapeEnabled, setBatchScrapeEnabled] = useState(false)
    const [batchScrapeHasOverride, setBatchScrapeHasOverride] = useState(false)
    const [betaSectionExpanded, setBetaSectionExpanded] = useState(false)
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

      // Load batch scrape feature flag and check if it has an override
      Promise.all([
        isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED),
        hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED),
      ]).then(([enabled, hasOverride]) => {
        setBatchScrapeEnabled(enabled)
        setBatchScrapeHasOverride(hasOverride)
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

      // Watch for batch scrape feature flag changes
      const unwatchFeatureFlags = storage.watch('local:featureFlags', async () => {
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
        const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
        setBatchScrapeEnabled(enabled)
        setBatchScrapeHasOverride(hasOverride)
      })
      const unwatchOverrides = storage.watch('local:featureFlagOverrides', async () => {
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
        const hasOverride = await hasFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
        setBatchScrapeEnabled(enabled)
        setBatchScrapeHasOverride(hasOverride)
      })

      return () => {
        unwatchDebugMode()
        unwatchDebugUnlocked()
        unwatchFeatureFlags()
        unwatchOverrides()
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

    const handleBatchScrapeToggle = async (checked: boolean) => {
      // Save local override
      await setFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED, checked)
      setBatchScrapeEnabled(checked)
      setBatchScrapeHasOverride(true)

      // If user has consent, mark them as having an override in PostHog
      // This allows excluding them from A/B experiments
      const consent = await getConsentState()
      if (consent === true) {
        const posthog = (window as any).__scrape_similar_posthog
        if (posthog) {
          posthog.setPersonProperties({
            [`${FEATURE_FLAGS.BATCH_SCRAPE_ENABLED}_override`]: true,
          })
        }
      }

      // Track feature flag override
      trackEvent(ANALYTICS_EVENTS.FEATURE_FLAG_OVERRIDE, {
        flag: FEATURE_FLAGS.BATCH_SCRAPE_ENABLED,
        value: checked,
      })
    }

    const handleBatchScrapeClearOverride = async () => {
      await clearFeatureFlagOverride(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      const enabled = await isFeatureEnabled(FEATURE_FLAGS.BATCH_SCRAPE_ENABLED)
      setBatchScrapeEnabled(enabled)
      setBatchScrapeHasOverride(false)
    }

    const handleBatchScrapeSelectChange = async (value: string) => {
      if (value === 'automatic') {
        // Clear override, use PostHog value
        await handleBatchScrapeClearOverride()
      } else if (value === 'on') {
        // Set manual override to true
        await handleBatchScrapeToggle(true)
      } else if (value === 'off') {
        // Set manual override to false
        await handleBatchScrapeToggle(false)
      }
    }

    const getBatchScrapeLabel = (): string => {
      if (!batchScrapeHasOverride) {
        return batchScrapeEnabled ? 'Automatic (On)' : 'Automatic (Off)'
      }
      return batchScrapeEnabled ? 'Always On' : 'Always Off'
    }

    // Generate unique ids for switch components for accessibility
    const analyticsSwitchId = useId()
    const debugSwitchId = useId()
    const batchScrapeSwitchId = useId()
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
            Theme
          </span>
          <ModeToggle id={themeToggleId} aria-labelledby={`${themeToggleId}-label`} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${keyboardShortcutId}-label`}>
            Keyboard shortcut
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
                <Clipboard className="mr-1" />
                Copy address
              </Button>
            </TooltipTrigger>
            <TooltipContent>Paste in a new tab to open settings</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${systemPresetsId}-label`}>
            System presets
          </span>
          <Button
            id={systemPresetsId}
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetSystemPresets}
            aria-labelledby={`${systemPresetsId}-label`}
          >
            Reset
          </Button>
        </div>
        {!consentLoading && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium" id={`${analyticsSwitchId}-label`}>
              Anonymous analytics
            </span>
            <Switch
              id={analyticsSwitchId}
              aria-labelledby={`${analyticsSwitchId}-label`}
              checked={consentState === true}
              onCheckedChange={handleAnalyticsToggle}
            />
          </div>
        )}

        {/* Beta Section - Always visible, collapsible */}
        <div className="border-t pt-4">
          <button
            onClick={() => setBetaSectionExpanded(!betaSectionExpanded)}
            className="flex items-center justify-between w-full text-sm font-medium mb-4 hover:opacity-70 transition-opacity"
          >
            <span>Beta Features</span>
            {betaSectionExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {betaSectionExpanded && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium" id={`${batchScrapeSwitchId}-label`}>
                  Batch scrape
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id={batchScrapeSwitchId}
                      aria-labelledby={`${batchScrapeSwitchId}-label`}
                      variant="outline"
                      size="sm"
                      className="justify-between"
                    >
                      {getBatchScrapeLabel()} <ChevronsUpDown className="ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleBatchScrapeSelectChange('automatic')}>
                      Automatic
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchScrapeSelectChange('on')}>
                      Always On
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBatchScrapeSelectChange('off')}>
                      Always Off
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>

        {showDebugRow && (
          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <span className="text-sm font-medium" id={`${debugSwitchId}-label`}>
              Debug mode
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
