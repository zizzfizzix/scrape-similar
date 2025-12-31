import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  liveGetBatchUrlResults,
  URL_STATUSES,
  type BatchScrapeUrlResult,
  type UrlStatus,
} from '@/utils/batch-scrape-db'
import { cn } from '@/utils/cn'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import React, { useMemo, useState } from 'react'

interface UrlProgressTableProps {
  batchId: string
}

// Config-driven status badge configuration
interface StatusConfig {
  icon: LucideIcon
  label: string
  variant: 'default' | 'secondary' | 'destructive'
  className?: string
  iconClassName?: string
}

const STATUS_CONFIG: Record<UrlStatus, StatusConfig> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    variant: 'secondary',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    variant: 'default',
    iconClassName: 'animate-spin',
  },
  completed: {
    icon: CheckCircle,
    label: 'Done',
    variant: 'default',
    className: 'bg-green-600 hover:bg-green-700',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    variant: 'destructive',
  },
  cancelled: {
    icon: AlertCircle,
    label: 'Cancelled',
    variant: 'secondary',
  },
}

/**
 * Displays a live-updating table of URL scraping progress.
 * Uses Dexie live queries to automatically update when URL statuses change.
 */
export const UrlProgressTable: React.FC<UrlProgressTableProps> = ({ batchId }) => {
  // Live query - automatically updates when URL results change
  const urlResults = useLiveQuery(() => liveGetBatchUrlResults(batchId), [batchId], [])

  // Default: show everything except completed
  const [selectedStatuses, setSelectedStatuses] = useState<Set<UrlStatus>>(
    new Set(URL_STATUSES.filter((status) => status !== 'completed')),
  )

  // Toggle status selection
  const toggleStatus = (status: UrlStatus) => {
    setSelectedStatuses((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(status)) {
        newSet.delete(status)
      } else {
        newSet.add(status)
      }
      return newSet
    })
  }

  // Filter URLs based on selected statuses
  const filteredUrlResults = useMemo(() => {
    if (!urlResults) return []
    return urlResults.filter((result) => selectedStatuses.has(result.status as UrlStatus))
  }, [urlResults, selectedStatuses])

  // Count URLs by status
  const statusCounts = useMemo(() => {
    if (!urlResults) return {} as Record<UrlStatus, number>
    return URL_STATUSES.reduce(
      (acc, status) => {
        acc[status] = urlResults.filter((r) => r.status === status).length
        return acc
      },
      {} as Record<UrlStatus, number>,
    )
  }, [urlResults])

  if (!urlResults || urlResults.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">URL Progress</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Showing {filteredUrlResults.length} of {urlResults.length}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto" align="end">
              <div className="space-y-4">
                <div className="font-semibold text-sm">Filter by status</div>
                <div className="space-y-3">
                  {URL_STATUSES.map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <Checkbox
                        id={status}
                        checked={selectedStatuses.has(status)}
                        onCheckedChange={() => toggleStatus(status)}
                      />
                      <label
                        htmlFor={status}
                        className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 capitalize"
                      >
                        {status} ({statusCounts[status] || 0})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">URL</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">Rows</TableHead>
              <TableHead className="w-[30%]">Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUrlResults.map((urlResult) => (
              <UrlProgressRow key={urlResult.id} urlResult={urlResult} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

interface UrlProgressRowProps {
  urlResult: BatchScrapeUrlResult
}

/** Renders a status badge using the config-driven approach */
const StatusBadge: React.FC<{ status: UrlStatus }> = ({ status }) => {
  const config = STATUS_CONFIG[status]
  if (!config) {
    return <Badge variant="secondary">Unknown</Badge>
  }

  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={cn('gap-1', config.className)}>
      <Icon className={cn('h-3 w-3', config.iconClassName)} />
      {config.label}
    </Badge>
  )
}

const UrlProgressRow: React.FC<UrlProgressRowProps> = ({ urlResult }) => {
  const rowCount = urlResult.result?.data?.length ?? 0
  const hasError = urlResult.error && urlResult.status === 'failed'

  return (
    <TableRow>
      <TableCell className="font-mono text-sm truncate max-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default">{urlResult.url}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md break-all">
            {urlResult.url}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        <StatusBadge status={urlResult.status} />
      </TableCell>
      <TableCell className="text-right">
        {urlResult.status === 'completed' ? (
          <span className="font-medium">{rowCount}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {hasError ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-destructive truncate cursor-default block max-w-full">
                {urlResult.error}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md">
              {urlResult.error}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}
