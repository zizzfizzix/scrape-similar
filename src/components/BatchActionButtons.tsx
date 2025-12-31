import { BatchSettingsDialog } from '@/components/BatchSettingsDialog'
import { BatchStatusIndicator } from '@/components/BatchStatus'
import { DeleteBatchDialog } from '@/components/DeleteBatchDialog'
import { DuplicateBatchButton } from '@/components/DuplicateBatchButton'
import ExportButtons from '@/components/ExportButtons'
import { Button } from '@/components/ui/button'
import {
  updateBatchJob,
  type BatchScrapeJob,
  type BatchSettings,
  type BatchStatistics,
} from '@/utils/batch-scrape-db'
import type { ScrapeConfig, ScrapedRow } from '@/utils/types'
import { Pause, Play } from 'lucide-react'
import React from 'react'
import { toast } from 'sonner'

interface BatchActionButtonsProps {
  // Batch state
  batch: BatchScrapeJob | null
  statistics?: BatchStatistics
  combinedResults: ScrapedRow[]
  config: ScrapeConfig
  selectedRows?: ScrapedRow[]

  // Pre-batch state (when batch is null)
  settings?: BatchSettings
  onSettingsChange?: (settings: BatchSettings) => void
  isStarting?: boolean

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
 * Handles both pre-batch (Settings + Start) and post-batch (actions) states with smart divider logic.
 * Supports two variants: 'header' mode for detail pages and 'card' mode for list items.
 */
export const BatchActionButtons: React.FC<BatchActionButtonsProps> = ({
  batch,
  statistics,
  combinedResults,
  config,
  selectedRows,
  settings,
  onSettingsChange,
  isStarting,
  canStart,
  canPause,
  canResume,
  onStart,
  onPause,
  onResume,
  onDelete,
  variant = 'header',
}) => {
  // Pre-batch state: Show Settings + Start button (only in header mode)
  if (!batch && variant === 'header') {
    return (
      <div className="flex items-center gap-3">
        {settings && onSettingsChange && (
          <BatchSettingsDialog
            settings={settings}
            onSave={onSettingsChange}
            triggerButton={{ size: 'sm' }}
            form={{ showResetButton: true }}
          />
        )}
        <Button onClick={onStart} disabled={isStarting} size="sm">
          <Play className="h-4 w-4 mr-2" />
          {isStarting ? 'Starting...' : 'Start'}
        </Button>
      </div>
    )
  }

  // If no batch in card mode, don't render anything
  if (!batch) {
    return null
  }

  // Handler for saving batch settings to database
  const handleBatchSettingsSave = async (newSettings: BatchSettings) => {
    await updateBatchJob(batch.id, { settings: newSettings })
    toast.success('Batch settings updated')
  }

  // Determine if settings can be edited
  const isSettingsEditable = batch.status === 'pending' || batch.status === 'paused'

  // Determine gap spacing based on variant
  const gapClass = variant === 'card' ? 'gap-2' : 'gap-3'

  // Determine if settings button should be shown
  // Card variant: hide if running or completed
  // Header variant: always show (read-only mode in dialog)
  const showSettingsButton =
    variant === 'header' || (batch.status !== 'running' && batch.status !== 'completed')

  // Post-batch state: Build sections and filter visible ones
  const sections = [
    // Section 1: Status indicator + Settings + Duplicate + Delete
    {
      visible: !!statistics,
      content: (
        <React.Fragment key="status-actions">
          <BatchStatusIndicator statistics={statistics!} />
          <Divider />
          {showSettingsButton && (
            <BatchSettingsDialog
              settings={batch.settings}
              onSave={handleBatchSettingsSave}
              isEditable={isSettingsEditable}
              triggerButton={{ size: 'sm' }}
            />
          )}
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
