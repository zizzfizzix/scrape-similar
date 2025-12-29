import { BatchStatusIcon, BatchStatusIndicator } from '@/components/BatchStatus'
import { DeleteBatchDialog } from '@/components/DeleteBatchDialog'
import { DuplicateBatchButton } from '@/components/DuplicateBatchButton'
import type { BatchStatistics } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import React from 'react'

interface BatchHeaderActionsProps {
  batch: BatchScrapeJob
  statistics?: BatchStatistics
  onDelete?: () => void
}

/**
 * Header actions for batch scrape - shows status, stats, and action buttons
 */
export const BatchHeaderActions: React.FC<BatchHeaderActionsProps> = ({
  batch,
  statistics,
  onDelete,
}) => {
  return (
    <>
      {/* Status badge with icon */}
      <div className="flex items-center gap-1.5 text-sm">
        <BatchStatusIcon status={batch.status} className="h-3.5 w-3.5" />
        <span className="capitalize font-medium">{batch.status}</span>
      </div>

      {/* Status counts */}
      {statistics && <BatchStatusIndicator statistics={statistics} />}

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Action buttons */}
      <DuplicateBatchButton batch={batch} size="sm" />
      <DeleteBatchDialog batch={batch} onSuccess={onDelete} size="sm" />
    </>
  )
}
