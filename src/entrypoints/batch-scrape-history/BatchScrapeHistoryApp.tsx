import { AppHeader } from '@/components/AppHeader'
import { BatchActionButtons } from '@/components/BatchActionButtons'
import { ConsentWrapper } from '@/components/ConsentWrapper'
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
import { getStorageUsage, liveGetAllBatchJobs, type BatchScrapeJob } from '@/utils/scrape-db'
import {
  formatStorageUsage,
  pauseBatchJob,
  resumeBatchJob,
  startBatchJob,
} from '@/utils/scrape-operations'
import { formatDistanceToNow } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { HardDrive, Loader2, Plus, Search } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

const BatchScrapeHistoryApp: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0, percentUsed: 0 })

  // Live query for batches - automatically updates when IndexedDB changes
  // Statistics are embedded in each batch, so no need to watch URL results!
  const batches = useLiveQuery(() => liveGetAllBatchJobs(), [], undefined) as
    | BatchScrapeJob[]
    | undefined

  const loading = batches === undefined

  // Batch control handlers - no need to manually refresh, useLiveQuery handles it
  const handleStartBatch = useCallback(async (batchId: string) => {
    try {
      await startBatchJob(batchId)
      toast.success('Batch started')
    } catch (error) {
      toast.error('Failed to start batch')
    }
  }, [])

  const handlePauseBatch = useCallback(async (batchId: string) => {
    try {
      await pauseBatchJob(batchId)
      toast.success('Batch paused')
    } catch (error) {
      toast.error('Failed to pause batch')
    }
  }, [])

  const handleResumeBatch = useCallback(async (batchId: string) => {
    try {
      await resumeBatchJob(batchId)
      toast.success('Batch resumed')
    } catch (error) {
      toast.error('Failed to resume batch')
    }
  }, [])

  // Load storage usage periodically
  useEffect(() => {
    const loadStorage = async () => {
      const usage = await getStorageUsage()
      setStorageUsage(usage)
    }

    loadStorage()
    const interval = setInterval(loadStorage, 60000) // Update every 60 seconds

    return () => clearInterval(interval)
  }, [])

  // Filter batches based on search and status
  const filteredBatches = useMemo(() => {
    if (!batches) return []

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

    return filtered
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
                  // Statistics are embedded in the batch object!
                  const stats = batch.statistics
                  return (
                    <Card key={batch.id} className="hover:bg-muted/50 transition-colors">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div
                            className="space-y-2 flex-1 cursor-pointer"
                            onClick={() => handleOpenBatch(batch.id)}
                          >
                            <CardTitle className="text-lg ph_hidden">{batch.name}</CardTitle>
                            <CardDescription className="ph_hidden">
                              Created{' '}
                              {formatDistanceToNow(new Date(batch.createdAt), { addSuffix: true })}
                            </CardDescription>
                          </div>
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <BatchActionButtons
                              variant="card"
                              batch={batch}
                              statistics={stats}
                              combinedResults={[]}
                              config={batch.config}
                              canStart={batch.status === 'pending'}
                              canPause={batch.status === 'running'}
                              canResume={batch.status === 'paused'}
                              onStart={() => handleStartBatch(batch.id)}
                              onPause={() => handlePauseBatch(batch.id)}
                              onResume={() => handleResumeBatch(batch.id)}
                              onDelete={() => {
                                // No manual refresh needed - useLiveQuery will auto-update
                              }}
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
