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
import { BatchSettingsForm } from '@/entrypoints/batch-scrape/components/BatchSettings'
import { updateBatchJob, type BatchScrapeJob, type BatchSettings } from '@/utils/batch-scrape-db'
import type { ButtonSize } from '@/utils/types'
import { Settings } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

interface BatchSettingsDialogProps {
  batch: BatchScrapeJob
  /** Callback after successful settings update */
  onSettingsUpdated?: () => void
  /** Whether to stop click propagation (useful in clickable cards) */
  stopPropagation?: boolean
  /** Button size variant */
  size?: ButtonSize
}

export const BatchSettingsDialog: React.FC<BatchSettingsDialogProps> = ({
  batch,
  onSettingsUpdated,
  stopPropagation = false,
  size = 'icon',
}) => {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<BatchSettings>(batch.settings)
  const [isSaving, setIsSaving] = useState(false)

  // Reset settings when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      setSettings(batch.settings)
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
      await updateBatchJob(batch.id, { settings })
      toast.success('Batch settings updated')
      setOpen(false)
      onSettingsUpdated?.()
    } catch (error) {
      toast.error('Failed to update batch settings')
    } finally {
      setIsSaving(false)
    }
  }

  // Only allow editing for pending or paused batches
  const isEditable = batch.status === 'pending' || batch.status === 'paused'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size={size} onClick={handleTriggerClick}>
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Batch settings</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-[600px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Batch Settings</DialogTitle>
          <DialogDescription>
            {isEditable
              ? 'Configure how URLs are scraped in this batch.'
              : 'Settings cannot be changed while batch is running or completed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <BatchSettingsForm settings={settings} onChange={setSettings} disabled={!isEditable} />
        </div>
        {isEditable && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        )}
        {!isEditable && (
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
