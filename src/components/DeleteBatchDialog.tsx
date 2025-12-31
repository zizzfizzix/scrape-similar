import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { handleDeleteBatch } from '@/utils/batch-operations'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import type { ButtonSize } from '@/utils/types'
import { Trash2 } from 'lucide-react'
import React from 'react'

interface DeleteBatchDialogProps {
  batch: BatchScrapeJob
  /** Callback after successful deletion */
  onSuccess?: () => void
  /** Whether to stop click propagation (useful in clickable cards) */
  stopPropagation?: boolean
  /** Button size variant */
  size?: ButtonSize
}

export const DeleteBatchDialog: React.FC<DeleteBatchDialogProps> = ({
  batch,
  onSuccess,
  stopPropagation = false,
  size = 'icon',
}) => {
  const handleTriggerClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
  }

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size={size} onClick={handleTriggerClick}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Delete batch</TooltipContent>
      </Tooltip>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete batch?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{batch.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => handleDeleteBatch(batch, onSuccess)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
