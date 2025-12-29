import { AppHeader } from '@/components/AppHeader'
import { BatchStatusIndicator } from '@/components/BatchStatus'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { DeleteBatchDialog } from '@/components/DeleteBatchDialog'
import { DuplicateBatchButton } from '@/components/DuplicateBatchButton'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatStorageUsage } from '@/utils/batch-operations'
import {
  getAllBatchJobs,
  getBatchStatistics,
  getStorageUsage,
  type BatchScrapeJob,
} from '@/utils/batch-scrape-db'
import { formatDistanceToNow } from 'date-fns'
import { HardDrive, Loader2, Plus, Search } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const BatchScrapeHistoryApp: React.FC = () => {
  const [batches, setBatches] = useState<BatchScrapeJob[]>([])
  const [filteredBatches, setFilteredBatches] = useState<BatchScrapeJob[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0, percentUsed: 0 })
  const [loading, setLoading] = useState(true)
  const [batchStats, setBatchStats] = useState<Record<string, any>>({})

  // Load batches
  const loadBatches = useCallback(async () => {
    try {
      setLoading(true)
      const allBatches = await getAllBatchJobs()
      setBatches(allBatches)

      // Load statistics for each batch
      const stats: Record<string, any> = {}
      for (const batch of allBatches) {
        stats[batch.id] = await getBatchStatistics(batch.id)
      }
      setBatchStats(stats)

      setLoading(false)
    } catch (error) {
      toast.error('Failed to load batches')
      setLoading(false)
    }
  }, [])

  // Load storage usage
  const loadStorage = useCallback(async () => {
    const usage = await getStorageUsage()
    setStorageUsage(usage)
  }, [])

  // Initial load
  useEffect(() => {
    loadBatches()
    loadStorage()

    const interval = setInterval(async () => {
      try {
        // Only update if data actually changed
        const allBatches = await getAllBatchJobs()

        // Check if batch list changed (length or any status/updatedAt changed)
        setBatches((prev) => {
          if (prev.length !== allBatches.length) return allBatches

          const hasChanges = allBatches.some((newBatch, i) => {
            const oldBatch = prev.find((b) => b.id === newBatch.id)
            return (
              !oldBatch ||
              oldBatch.status !== newBatch.status ||
              oldBatch.name !== newBatch.name ||
              oldBatch.updatedAt !== newBatch.updatedAt
            )
          })

          return hasChanges ? allBatches : prev
        })

        // Update statistics only for batches with active status
        const activeBatches = allBatches.filter(
          (b) => b.status === 'running' || b.status === 'paused',
        )
        if (activeBatches.length > 0) {
          const stats: Record<string, any> = { ...batchStats }
          for (const batch of activeBatches) {
            stats[batch.id] = await getBatchStatistics(batch.id)
          }
          setBatchStats((prev) => {
            // Only update if stats changed for active batches
            const hasStatsChanges = activeBatches.some((b) => {
              const oldStats = prev[b.id]
              const newStats = stats[b.id]
              return (
                !oldStats ||
                oldStats.completed !== newStats.completed ||
                oldStats.failed !== newStats.failed ||
                oldStats.totalRows !== newStats.totalRows
              )
            })
            return hasStatsChanges ? stats : prev
          })
        }

        // Update storage less frequently
        loadStorage()
      } catch (error) {
        // Silent fail for polling updates
      }
    }, 3000) // Poll every 3 seconds (reduced from 5s but smarter)

    return () => clearInterval(interval)
  }, [loadBatches, loadStorage])

  // Filter batches
  useEffect(() => {
    let filtered = batches

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = batches.filter(
        (batch) =>
          batch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          batch.urls.some((url) => url.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((batch) => batch.status === statusFilter)
    }

    setFilteredBatches(filtered)
  }, [batches, searchQuery, statusFilter])

  // Handle new batch
  const handleNewBatch = () => {
    window.location.href = browser.runtime.getURL('/batch-scrape.html')
  }

  // Handle open batch
  const handleOpenBatch = (batchId: string) => {
    const url = new URL(browser.runtime.getURL('/batch-scrape.html'))
    url.searchParams.set('batchId', batchId)
    window.location.href = url.toString()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        <TooltipProvider>
          <AppHeader
            left={
              <div>
                <h1 className="text-2xl font-bold">Batch Scrape History</h1>
                <p className="text-sm text-muted-foreground">Manage your batch scrape jobs</p>
              </div>
            }
            right={
              <Button onClick={handleNewBatch}>
                <Plus className="h-4 w-4 mr-2" />
                New Batch
              </Button>
            }
          />

          {/* Main content */}
          <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
            {/* Filters and search */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Storage usage */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Storage Used:</span>
                  </div>
                  <div className="text-sm font-medium">
                    {formatStorageUsage(storageUsage, true)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Batch list */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBatches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    {searchQuery || statusFilter !== 'all'
                      ? 'No batches match your filters'
                      : 'No batch scrapes yet. Create one to get started!'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredBatches.map((batch) => {
                  const stats = batchStats[batch.id] || {}
                  return (
                    <Card
                      key={batch.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleOpenBatch(batch.id)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            <CardTitle className="text-lg ph_hidden">{batch.name}</CardTitle>
                            <CardDescription className="ph_hidden">
                              Created{' '}
                              {formatDistanceToNow(new Date(batch.createdAt), { addSuffix: true })}
                            </CardDescription>
                            {/* Status indicator with statistics */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <BatchStatusIndicator statistics={stats} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <DuplicateBatchButton batch={batch} stopPropagation />
                            <DeleteBatchDialog
                              batch={batch}
                              onSuccess={loadBatches}
                              stopPropagation
                            />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Total Rows Scraped: </span>
                          <span className="font-medium">
                            {(stats.totalRows || 0).toLocaleString()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </main>

          <Footer />
        </TooltipProvider>
      </ConsentWrapper>
    </div>
  )
}

export default BatchScrapeHistoryApp
