import { AppHeader } from '@/components/AppHeader'
import { BatchActionButtons } from '@/components/BatchActionButtons'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { Footer } from '@/components/footer'
import ResultsTable from '@/components/ResultsTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BatchConfig } from '@/entrypoints/batch-scrape/components/BatchConfig'
import { BatchSettingsComponent } from '@/entrypoints/batch-scrape/components/BatchSettings'
import { BatchUrlInput } from '@/entrypoints/batch-scrape/components/BatchUrlInput'
import { useBatchScrape } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
import { navigateToBatchHistory } from '@/utils/batch-operations'
import {
  DEFAULT_BATCH_SETTINGS,
  getStorageUsage,
  type BatchSettings,
} from '@/utils/batch-scrape-db'
import { validateAndDeduplicateUrls } from '@/utils/batch-url-utils'
import { ArrowLeft, Save } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const BatchScrapeApp: React.FC = () => {
  // URL params
  const urlParams = new URLSearchParams(window.location.search)
  const batchIdFromUrl = urlParams.get('batchId') || undefined
  const configFromUrl = urlParams.get('config') ? JSON.parse(urlParams.get('config')!) : undefined
  const urlsFromUrl = urlParams.get('urls') ? JSON.parse(urlParams.get('urls')!) : undefined

  // State
  const [urlsInput, setUrlsInput] = useState(
    urlsFromUrl ? (Array.isArray(urlsFromUrl) ? urlsFromUrl.join('\n') : '') : '',
  )
  const [config, setConfig] = useState<ScrapeConfig>(
    configFromUrl || {
      mainSelector: '',
      columns: [{ name: 'Text', selector: '.' }],
    },
  )
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS)
  const [batchName, setBatchName] = useState('')
  const [storageUsage, setStorageUsage] = useState({ used: 0, quota: 0, percentUsed: 0 })
  const [isCreating, setIsCreating] = useState(false)
  const [selectedRows, setSelectedRows] = useState<ScrapedRow[]>([])

  // Use batch scrape hook
  const {
    batch,
    urlResults,
    statistics,
    combinedResults,
    loading,
    error,
    createBatch,
    startBatch,
    pauseBatch,
    resumeBatch,
    updateBatchName,
  } = useBatchScrape(batchIdFromUrl, configFromUrl)

  // Load storage usage
  useEffect(() => {
    getStorageUsage().then(setStorageUsage)
    const interval = setInterval(() => {
      getStorageUsage().then(setStorageUsage)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Handle create batch
  const handleCreateBatch = useCallback(async () => {
    // Validate URLs
    const validation = validateAndDeduplicateUrls(urlsInput)
    if (validation.valid.length === 0) {
      toast.error('No valid URLs to scrape')
      return
    }

    // Validate config
    if (!config.mainSelector.trim()) {
      toast.error('Main selector is required')
      return
    }

    try {
      setIsCreating(true)
      const newBatch = await createBatch(config, validation.valid, batchName || undefined, settings)
      toast.success(`Created batch with ${validation.valid.length} URLs`)

      // Update URL to include batch ID
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('batchId', newBatch.id)
      newUrl.searchParams.delete('config')
      window.history.replaceState({}, '', newUrl.toString())
    } catch (err) {
      toast.error('Failed to create batch')
    } finally {
      setIsCreating(false)
    }
  }, [urlsInput, config, settings, batchName, createBatch])

  // Handle start
  const handleStart = useCallback(async () => {
    try {
      await startBatch()
      toast.success('Batch scrape started')
    } catch (err) {
      toast.error('Failed to start batch')
    }
  }, [startBatch])

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

  // Set initial batch name and config from batch
  useEffect(() => {
    if (batch) {
      if (!batchName) {
        setBatchName(batch.name)
      }
      // Load the config from the batch if we don't have it from URL
      if (!configFromUrl) {
        setConfig(batch.config)
      }
    }
  }, [batch, batchName, configFromUrl])

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
  const canStart = !!(batch && batch.status === 'pending')
  const canPause = isRunning
  const canResume = isPaused

  // Calculate progress for header
  const progressPercentage =
    batch && statistics.total > 0
      ? ((statistics.completed + statistics.failed + statistics.cancelled) / statistics.total) * 100
      : 0

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        <TooltipProvider>
          <AppHeader
            left={
              <Button variant="outline" size="sm" onClick={navigateToBatchHistory}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to History
              </Button>
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
              <BatchActionButtons
                variant="header"
                batch={batch}
                statistics={statistics}
                combinedResults={combinedResults}
                config={config}
                selectedRows={selectedRows}
                isCreating={isCreating}
                onCreateBatch={handleCreateBatch}
                canStart={canStart}
                canPause={canPause}
                canResume={canResume}
                onStart={handleStart}
                onPause={handlePause}
                onResume={handleResume}
                onDelete={navigateToBatchHistory}
              />
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
            {/* Show form if no batch yet */}
            {!batch && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <BatchConfig config={config} onChange={setConfig} disabled={isCreating} />
                  </div>
                  <div className="space-y-6">
                    <BatchSettingsComponent
                      settings={settings}
                      onChange={setSettings}
                      disabled={isCreating}
                    />
                  </div>
                </div>

                <BatchUrlInput urls={urlsInput} onChange={setUrlsInput} disabled={isCreating} />
              </>
            )}

            {/* Results */}
            {batch && combinedResults.length > 0 && (
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

export default BatchScrapeApp
