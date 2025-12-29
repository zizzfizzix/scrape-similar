import type { BatchStatistics } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
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

interface StatusIconProps {
  status: BatchStatus
  className?: string
}

/**
 * Returns the appropriate status icon component for a batch status
 */
export const BatchStatusIcon: React.FC<StatusIconProps> = ({ status, className = 'h-4 w-4' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = config.icon
  return (
    <Icon className={`${className} ${config.className} ${config.animate ? 'animate-spin' : ''}`} />
  )
}

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

const StatItem: React.FC<StatItemProps> = ({ count, statusKey }) => {
  if (count <= 0) return null

  const status = STAT_TO_STATUS_MAP[statusKey]
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className={`h-3.5 w-3.5 ${config.className} ${config.animate ? 'animate-spin' : ''}`} />
      <span>{count}</span>
    </div>
  )
}

interface BatchStatusIndicatorProps {
  statistics: BatchStatistics
}

/**
 * Displays batch statistics as compact icons with counts
 */
export const BatchStatusIndicator: React.FC<BatchStatusIndicatorProps> = ({ statistics }) => {
  return (
    <>
      <StatItem count={statistics.completed} statusKey="completed" />
      <StatItem count={statistics.failed} statusKey="failed" />
      <StatItem count={statistics.running} statusKey="running" />
      <StatItem count={statistics.pending} statusKey="pending" />
    </>
  )
}
