import { AppHeader } from '@/components/AppHeader'
import { BatchActionButtons } from '@/components/BatchActionButtons'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { Footer } from '@/components/footer'
import ResultsTable from '@/components/ResultsTable'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UrlProgressTable } from '@/components/UrlProgressTable'
import { useBatchScrape } from '@/hooks/useBatchScrape'
import type { BatchSettings } from '@/utils/batch-scrape-db'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Plus, Save } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const ScrapeDetailPage: React.FC = () => {
  // Get batch ID from URL params
  const { id: batchId } = useParams({ from: '/scrapes/$id' })
  const navigate = useNavigate()

  // State
  const [selectedRows, setSelectedRows] = useState<ScrapedRow[]>([])
  const [batchName, setBatchName] = useState('')
  const [settings, setSettings] = useState<BatchSettings | null>(null)

  // Use batch scrape hook
  const {
    batch,
    statistics,
    combinedResults,
    createAndStartBatch,
    pauseBatch,
    resumeBatch,
    updateBatchName,
  } = useBatchScrape(batchId)

  // Handle pause
  const handlePause = useCallback(async () => {
    try {
      await pauseBatch()
      toast.success('Batch scrape paused')
    } catch (err) {
      toast.error('Failed to pause batch')
    }
  }, [pauseBatch])

  // Handle resume
  const handleResume = useCallback(async () => {
    try {
      await resumeBatch()
      toast.success('Batch scrape resumed')
    } catch (err) {
      toast.error('Failed to resume batch')
    }
  }, [resumeBatch])

  // Handle name update
  const handleNameUpdate = useCallback(async () => {
    if (!batch) return
    try {
      await updateBatchName(batchName)
      toast.success('Batch name updated')
    } catch (err) {
      toast.error('Failed to update batch name')
    }
  }, [batch, batchName, updateBatchName])

  // Handle delete - navigate back to list
  const handleDelete = useCallback(() => {
    navigate({ to: '/scrapes' })
  }, [navigate])

  // Set initial batch name from existing batch
  useEffect(() => {
    if (batch && !batchName) {
      setBatchName(batch.name)
    }
  }, [batch, batchName])

  // Set initial settings from existing batch
  useEffect(() => {
    if (batch && !settings) {
      setSettings(batch.settings)
    }
  }, [batch, settings])

  // Update document title based on batch name
  useEffect(() => {
    if (batch?.name) {
      document.title = `${batch.name} - Batch Scrape - Scrape Similar`
    } else {
      document.title = 'Batch Scrape - Scrape Similar'
    }
  }, [batch?.name])

  const isRunning = batch?.status === 'running'
  const isPaused = batch?.status === 'paused'
  const isCompleted = batch?.status === 'completed'
  const canPause = isRunning
  const canResume = isPaused

  // Calculate progress for header
  const progressPercentage =
    batch && statistics.total > 0
      ? ((statistics.completed + statistics.failed + statistics.cancelled) / statistics.total) * 100
      : 0

  const config = batch?.config

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        <TooltipProvider>
          <AppHeader
            left={
              <ButtonGroup>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/scrapes">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Batches
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/scrapes/new">
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </Link>
                </Button>
              </ButtonGroup>
            }
            center={
              <div className="relative w-96">
                <Input
                  placeholder="Batch name (optional)"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="text-center font-semibold pr-10"
                />
                {batch && batchName !== batch.name && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleNameUpdate}
                          className="h-8 w-8"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Save batch name</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            }
            right={
              config &&
              settings && (
                <BatchActionButtons
                  variant="header"
                  batch={batch}
                  statistics={statistics}
                  combinedResults={combinedResults}
                  config={config}
                  selectedRows={selectedRows}
                  settings={settings}
                  onSettingsChange={setSettings}
                  canPause={canPause}
                  canResume={canResume}
                  onPause={handlePause}
                  onResume={handleResume}
                  onDelete={handleDelete}
                />
              )
            }
            progressBar={
              batch &&
              !isCompleted && (
                <div className="w-full h-1 bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              )
            }
          />

          {/* Main content */}
          <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
            {/* URL Progress Table */}
            {batch && <UrlProgressTable batchId={batch.id} />}

            {/* Results */}
            {batch && config && combinedResults.length > 0 && (
              <ResultsTable
                data={combinedResults}
                config={{
                  ...config,
                  columns: [{ name: 'url', selector: '.' }, ...config.columns],
                }}
                columnOrder={['url', ...config.columns.map((c) => c.name)]}
                showEmptyRowsToggle={false}
                eventPrefix="BATCH_SCRAPE"
                onSelectedRowsChange={setSelectedRows}
              />
            )}
          </main>

          <Footer />
        </TooltipProvider>
      </ConsentWrapper>
    </div>
  )
}

export default ScrapeDetailPage
