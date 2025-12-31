import { BatchSettingsForm } from '@/components/BatchSettings'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_BATCH_SETTINGS, type BatchSettings } from '@/utils/batch-scrape-db'
import type { ButtonSize, ButtonVariant } from '@/utils/types'
import { RotateCcw, Settings } from 'lucide-react'
import React, { useState } from 'react'

interface TriggerButtonConfig {
  /** Button size variant */
  size?: ButtonSize
  /** Button variant */
  variant?: ButtonVariant
  /** Whether the trigger button is disabled */
  disabled?: boolean
  /** Whether to stop click propagation (useful in clickable cards) */
  stopPropagation?: boolean
}

interface FormConfig {
  /** Whether to show the reset button in the form */
  showResetButton?: boolean
  /** Description text for the dialog */
  description?: string
}

interface BatchSettingsDialogProps {
  /** Current settings to display/edit */
  settings: BatchSettings
  /** Called when user saves settings - parent decides what to do (save to DB, update state, etc.) */
  onSave: (settings: BatchSettings) => void | Promise<void>
  /** Whether the settings can be edited (default: true) */
  isEditable?: boolean
  /** Trigger button configuration */
  triggerButton?: TriggerButtonConfig
  /** Form configuration */
  form?: FormConfig
}

/**
 * A controlled dialog for editing batch settings.
 * The parent component provides settings and an onSave callback.
 * The parent decides what to do on save (update DB, update local state, etc.).
 */
export const BatchSettingsDialog: React.FC<BatchSettingsDialogProps> = ({
  settings,
  onSave,
  isEditable = true,
  triggerButton = {},
  form = {},
}) => {
  // Destructure nested configs with defaults
  const {
    size = 'sm',
    variant = 'ghost',
    disabled = false,
    stopPropagation = false,
  } = triggerButton
  const { showResetButton = false, description = 'Configure how URLs are scraped in this batch.' } =
    form
  const [open, setOpen] = useState(false)
  const [localSettings, setLocalSettings] = useState<BatchSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)

  // Reset local settings when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setLocalSettings(settings)
    }
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await onSave(localSettings)
      setOpen(false)
    } catch (error) {
      // Parent's onSave should handle errors/toasts
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setLocalSettings(settings)
    setOpen(false)
  }

  const handleReset = () => {
    setLocalSettings(DEFAULT_BATCH_SETTINGS)
  }

  const isDefaultSettings = () => {
    return (
      localSettings.maxConcurrency === DEFAULT_BATCH_SETTINGS.maxConcurrency &&
      localSettings.delayBetweenRequests === DEFAULT_BATCH_SETTINGS.delayBetweenRequests &&
      localSettings.maxRetries === DEFAULT_BATCH_SETTINGS.maxRetries &&
      localSettings.disableJsRendering === DEFAULT_BATCH_SETTINGS.disableJsRendering
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant={variant} size={size} onClick={handleTriggerClick} disabled={disabled}>
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Batch settings</TooltipContent>
      </Tooltip>
      <DialogContent
        className="sm:max-w-[600px]"
        onClick={(e) => stopPropagation && e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Batch Settings</DialogTitle>
          <DialogDescription>
            {isEditable
              ? description
              : 'Settings cannot be changed while batch is running or completed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <BatchSettingsForm
            settings={localSettings}
            onChange={setLocalSettings}
            disabled={!isEditable || disabled}
            showResetButton={showResetButton}
          />
        </div>
        {isEditable ? (
          <DialogFooter className="sm:flex-row sm:justify-between sm:space-x-0">
            {showResetButton ? (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isSaving || isDefaultSettings()}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
