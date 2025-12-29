import { BatchStatusIndicator } from '@/components/BatchStatus'
import { DeleteBatchDialog } from '@/components/DeleteBatchDialog'
import { DuplicateBatchButton } from '@/components/DuplicateBatchButton'
import ExportButtons from '@/components/ExportButtons'
import { Button } from '@/components/ui/button'
import type { BatchStatistics } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import type { ScrapeConfig, ScrapedRow } from '@/utils/types'
import { Pause, Play } from 'lucide-react'
import React from 'react'

interface BatchActionButtonsProps {
  // Batch state
  batch: BatchScrapeJob | null
  statistics?: BatchStatistics
  combinedResults: ScrapedRow[]
  config: ScrapeConfig
  selectedRows?: ScrapedRow[]

  // Pre-batch state
  isCreating?: boolean
  onCreateBatch?: () => void

  // Post-batch controls
  canStart?: boolean
  canPause?: boolean
  canResume?: boolean
  onStart?: () => void
  onPause?: () => void
  onResume?: () => void
  onDelete?: () => void

  // New props for variant support
  variant?: 'header' | 'card' // Default: 'header'
}

/**
 * Divider component for separating sections
 */
const Divider: React.FC = () => <div className="h-6 w-px bg-border" />

/**
 * Unified component for all batch action buttons in the header.
 * Handles both pre-batch (Create) and post-batch (actions) states with smart divider logic.
 * Supports two variants: 'header' mode for detail pages and 'card' mode for list items.
 */
export const BatchActionButtons: React.FC<BatchActionButtonsProps> = ({
  batch,
  statistics,
  combinedResults,
  config,
  selectedRows,
  isCreating,
  onCreateBatch,
  canStart,
  canPause,
  canResume,
  onStart,
  onPause,
  onResume,
  onDelete,
  variant = 'header',
}) => {
  // Pre-batch state: Show Create Batch button (only in header mode)
  if (!batch && variant === 'header') {
    return (
      <Button onClick={onCreateBatch} disabled={isCreating} size="default">
        {isCreating ? 'Creating...' : 'Create Batch'}
      </Button>
    )
  }

  // If no batch in card mode, don't render anything
  if (!batch) {
    return null
  }

  // Determine gap spacing based on variant
  const gapClass = variant === 'card' ? 'gap-2' : 'gap-3'

  // Post-batch state: Build sections and filter visible ones
  const sections = [
    // Section 1: Status indicator + Duplicate + Delete
    {
      visible: !!statistics,
      content: (
        <React.Fragment key="status-actions">
          <BatchStatusIndicator statistics={statistics!} />
          <Divider />
          <DuplicateBatchButton batch={batch} size="sm" />
          <DeleteBatchDialog batch={batch} onSuccess={onDelete} size="sm" />
        </React.Fragment>
      ),
    },
    // Section 2: Export buttons
    {
      visible: combinedResults.length > 0,
      content: (
        <ExportButtons
          key="export"
          scrapeResult={{
            data: combinedResults,
            columnOrder: ['url', ...config.columns.map((c) => c.name)],
          }}
          config={config}
          showEmptyRows={false}
          selectedRows={selectedRows}
          filename={`${batch.name} - ${new Date().toISOString().split('T')[0]}`}
          variant="outline"
          size="sm"
        />
      ),
    },
    // Section 3: Play controls (Start/Pause/Resume)
    {
      visible: canStart || canPause || canResume,
      content: (
        <React.Fragment key="play-controls">
          {canStart && (
            <Button onClick={onStart} size="sm">
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
          {canPause && (
            <Button onClick={onPause} variant="outline" size="sm">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {canResume && (
            <Button onClick={onResume} size="sm">
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
        </React.Fragment>
      ),
    },
  ]

  // Filter to only visible sections
  const visibleSections = sections.filter((s) => s.visible)

  // Render sections with dividers between them
  return (
    <div className={`flex items-center ${gapClass}`}>
      {visibleSections.flatMap((section, index) =>
        index > 0 ? [<Divider key={`divider-${index}`} />, section.content] : [section.content],
      )}
    </div>
  )
}
