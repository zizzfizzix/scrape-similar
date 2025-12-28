import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { BatchStatistics } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import React from 'react'

interface BatchProgressProps {
  batch: BatchScrapeJob
  statistics: BatchStatistics
}

export const BatchProgress: React.FC<BatchProgressProps> = ({ batch, statistics }) => {
  const progressPercentage =
    statistics.total > 0
      ? ((statistics.completed + statistics.failed + statistics.cancelled) / statistics.total) * 100
      : 0

  const getStatusColor = (status: BatchScrapeJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-500'
      case 'running':
        return 'bg-blue-500'
      case 'paused':
        return 'bg-yellow-500'
      case 'completed':
        return 'bg-green-500'
      case 'cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: BatchScrapeJob['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />
      case 'paused':
        return <Clock className="h-4 w-4" />
      case 'cancelled':
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {statistics.completed + statistics.failed + statistics.cancelled} / {statistics.total}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Status badges */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusColor(batch.status)}`} />
              <span className="text-sm capitalize">{batch.status}</span>
            </div>
            {getStatusIcon(batch.status)}
          </div>

          {statistics.running > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg">
              <span className="text-sm text-blue-600 dark:text-blue-400">Running</span>
              <Badge variant="secondary" className="bg-blue-500/20">
                {statistics.running}
              </Badge>
            </div>
          )}

          {statistics.pending > 0 && (
            <div className="flex items-center justify-between p-3 bg-gray-500/10 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">Pending</span>
              <Badge variant="secondary" className="bg-gray-500/20">
                {statistics.pending}
              </Badge>
            </div>
          )}

          {statistics.completed > 0 && (
            <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
              <span className="text-sm text-green-600 dark:text-green-400">Completed</span>
              <Badge variant="secondary" className="bg-green-500/20">
                {statistics.completed}
              </Badge>
            </div>
          )}

          {statistics.failed > 0 && (
            <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg">
              <span className="text-sm text-red-600 dark:text-red-400">Failed</span>
              <Badge variant="secondary" className="bg-red-500/20">
                {statistics.failed}
              </Badge>
            </div>
          )}

          {statistics.totalRows > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm text-muted-foreground">Total Rows</span>
              <Badge variant="secondary">{statistics.totalRows.toLocaleString()}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
