import { ResponsiveDialog } from '@/components/responsive-dialog'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getPresets, setPresets, USER_PRESETS_VERSION } from '@/utils/storage'
import { validatePresetImport } from '@/utils/validatePresets'
import log from 'loglevel'
import { Clipboard, Import, Upload } from 'lucide-react'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

interface SettingsProps {
  onResetSystemPresets?: () => void
  onPresetsImported?: () => void
  debugMode?: boolean
  onDebugModeChange?: (enabled: boolean) => void
  className?: string
  ref?: React.Ref<{ unlockDebugMode: () => void }>
}

type ImportConfirmState =
  | { open: false }
  | { open: true; presets: Preset[]; skippedSystemCount: number }

export const Settings = React.memo(
  ({
    onResetSystemPresets,
    onPresetsImported,
    debugMode = false,
    onDebugModeChange,
    className,
    ref,
  }: SettingsProps) => {
    const [showDebugRow, setShowDebugRow] = useState(debugMode)
    const [importConfirm, setImportConfirm] = useState<ImportConfirmState>({ open: false })
    const fileInputRef = useRef<HTMLInputElement>(null)
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

    const handleExportPresets = useCallback(async () => {
      try {
        const presets = await getPresets()
        const blob = new Blob(
          [JSON.stringify({ version: USER_PRESETS_VERSION, presets }, null, 2)],
          { type: 'application/json' },
        )
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'scrape-similar-presets.json'
        a.click()
        URL.revokeObjectURL(url)
        trackEvent(ANALYTICS_EVENTS.PRESET_EXPORT, { presetCount: presets.length })
      } catch (error) {
        log.error('Error exporting presets:', error)
      }
    }, [])

    const handleImportPresetsClick = useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const handleImportFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text) as unknown
        const result = validatePresetImport(data)
        if ('error' in result) {
          toast.error(result.error)
          trackEvent(ANALYTICS_EVENTS.PRESET_IMPORT, {
            success: false,
            reason: result.error,
          })
          return
        }
        setImportConfirm({
          open: true,
          presets: result.presets,
          skippedSystemCount: result.skippedSystemCount,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid JSON'
        toast.error(`Failed to read preset file: ${message}`)
        trackEvent(ANALYTICS_EVENTS.PRESET_IMPORT, {
          success: false,
          reason: message,
        })
      }
    }, [])

    const handleImportConfirm = useCallback(async () => {
      if (!importConfirm.open) return
      const { presets, skippedSystemCount } = importConfirm
      try {
        const ok = await setPresets(presets)
        if (!ok) throw new Error('setPresets failed')
        trackEvent(ANALYTICS_EVENTS.PRESET_IMPORT, {
          success: true,
          presetCount: presets.length,
        })
        setImportConfirm({ open: false })
        const message =
          skippedSystemCount > 0
            ? `Imported ${presets.length} presets. ${skippedSystemCount} (system) presets were skipped.`
            : `Imported ${presets.length} presets.`
        toast.success(message)
        onPresetsImported?.()
      } catch (error) {
        log.error('Error importing presets:', error)
        toast.error('Failed to import presets')
        trackEvent(ANALYTICS_EVENTS.PRESET_IMPORT, {
          success: false,
          reason: error instanceof Error ? error.message : 'Import failed',
        })
      }
    }, [importConfirm, onPresetsImported])

    const handleImportCancel = useCallback(() => {
      setImportConfirm({ open: false })
    }, [])

    const handleAnalyticsToggle = (checked: boolean) => {
      setConsent(checked)
    }

    // Generate unique ids for switch components for accessibility
    const analyticsSwitchId = useId()
    const debugSwitchId = useId()
    const themeToggleId = useId()
    const keyboardShortcutId = useId()
    const systemPresetsId = useId()
    const userPresetsId = useId()

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
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium" id={`${userPresetsId}-label`}>
            User presets
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-hidden
            onChange={handleImportFileChange}
          />
          <ButtonGroup aria-label="User presets import and export">
            <Button
              id={`${userPresetsId}-import`}
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImportPresetsClick}
              aria-label="Import user presets"
            >
              <Import className="mr-1 size-4" />
              Import
            </Button>
            <Button
              id={`${userPresetsId}-export`}
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportPresets}
              aria-label="Export user presets"
            >
              <Upload className="mr-1 size-4" />
              Export
            </Button>
          </ButtonGroup>
        </div>
        <ResponsiveDialog.Root
          open={importConfirm.open}
          onOpenChange={(open) => !open && setImportConfirm({ open: false })}
        >
          <ResponsiveDialog.Content showCloseButton>
            <ResponsiveDialog.Header>
              <ResponsiveDialog.Title>Import user presets</ResponsiveDialog.Title>
              <ResponsiveDialog.Description>
                {importConfirm.open && importConfirm.skippedSystemCount > 0 && (
                  <span className="block mb-2">
                    {importConfirm.skippedSystemCount} preset(s) were skipped because they match
                    system presets and cannot be imported.
                  </span>
                )}
                Current presets will be lost.
                <br />
                Edit the file before importing to merge or adjust.
              </ResponsiveDialog.Description>
            </ResponsiveDialog.Header>
            <ResponsiveDialog.Footer>
              <ResponsiveDialog.Close>
                <Button type="button" variant="outline" onClick={handleImportCancel}>
                  Cancel
                </Button>
              </ResponsiveDialog.Close>
              <Button type="button" variant="destructive" onClick={handleImportConfirm}>
                Import
              </Button>
            </ResponsiveDialog.Footer>
          </ResponsiveDialog.Content>
        </ResponsiveDialog.Root>
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
        {showDebugRow && (
          <div className="flex items-center justify-between gap-4">
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
