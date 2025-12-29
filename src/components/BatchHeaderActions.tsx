import { BatchStatusIndicator } from '@/components/BatchStatus'
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
      {/* Status indicator with item statistics */}
      {statistics && <BatchStatusIndicator statistics={statistics} />}

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Action buttons */}
      <DuplicateBatchButton batch={batch} size="sm" />
      <DeleteBatchDialog batch={batch} onSuccess={onDelete} size="sm" />
    </>
  )
}
