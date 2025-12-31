import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { BatchStatistics } from '@/hooks/useBatchScrape'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import { CheckCircle2, Clock, Loader2, Pause, XCircle } from 'lucide-react'
import React from 'react'

type BatchStatus = BatchScrapeJob['status']

// Map statistics keys to status keys for lookup
const STAT_TO_STATUS_MAP = {
  completed: 'completed',
  failed: 'cancelled', // Use cancelled icon/color for failed
  running: 'running',
  pending: 'pending',
} as const

// Consolidated status configuration
const STATUS_CONFIG = {
  running: { icon: Loader2, className: 'text-blue-500', animate: true },
  completed: { icon: CheckCircle2, className: 'text-green-500', animate: false },
  paused: { icon: Pause, className: 'text-yellow-500', animate: false },
  cancelled: { icon: XCircle, className: 'text-red-500', animate: false },
  pending: { icon: Clock, className: 'text-gray-500', animate: false },
} as const

/**
 * Get badge variant for batch status
 */
export const getStatusBadgeVariant = (
  status: BatchStatus,
): 'default' | 'secondary' | 'destructive' => {
  switch (status) {
    case 'running':
    case 'completed':
      return 'default'
    case 'cancelled':
      return 'destructive'
    default:
      return 'secondary'
  }
}

interface StatItemProps {
  count: number
  statusKey: keyof typeof STAT_TO_STATUS_MAP
}

const STATUS_LABELS = {
  completed: 'Completed',
  failed: 'Failed',
  running: 'Running',
  pending: 'Pending',
} as const

const StatItem: React.FC<StatItemProps> = ({ count, statusKey }) => {
  if (count <= 0) return null

  const status = STAT_TO_STATUS_MAP[statusKey]
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const label = STATUS_LABELS[statusKey]

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Icon
              className={`h-3.5 w-3.5 ${config.className} ${config.animate ? 'animate-spin' : ''}`}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span>{count}</span>
    </div>
  )
}

interface BatchStatusIndicatorProps {
  statistics: BatchStatistics
}

/**
 * Displays batch statistics as compact icons with counts and tooltips
 */
export const BatchStatusIndicator: React.FC<BatchStatusIndicatorProps> = ({ statistics }) => {
  return (
    <>
      {/* Item-level statistics */}
      <StatItem count={statistics.completed} statusKey="completed" />
      <StatItem count={statistics.failed} statusKey="failed" />
      <StatItem count={statistics.running} statusKey="running" />
      <StatItem count={statistics.pending} statusKey="pending" />

      {/* if any statitems are greater than 0 then show a span with "URLs" */}
      {Object.values(statistics).some((count) => count > 0) && (
        <span className="text-sm text-muted-foreground -ml-1.5">URLs</span>
      )}
    </>
  )
}
