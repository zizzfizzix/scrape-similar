import { ConsentWrapper } from '@/components/ConsentWrapper'
import ExportButtons from '@/components/ExportButtons'
import { Footer } from '@/components/footer'
import ResultsTable from '@/components/ResultsTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import {
  DEFAULT_BATCH_SETTINGS,
  getStorageUsage,
  type BatchSettings,
} from '@/utils/batch-scrape-db'
import { validateAndDeduplicateUrls } from '@/utils/batch-url-utils'
import { ArrowLeft, HardDrive, Pause, Play, Save, X } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BatchConfig } from './components/BatchConfig'
import { BatchProgress } from './components/BatchProgress'
import { BatchSettingsComponent } from './components/BatchSettings'
import { BatchUrlInput } from './components/BatchUrlInput'
import { useBatchScrape } from './hooks/useBatchScrape'

const BatchScrapeApp: React.FC = () => {
  // URL params
  const urlParams = new URLSearchParams(window.location.search)
  const batchIdFromUrl = urlParams.get('batchId') || undefined
  const configFromUrl = urlParams.get('config') ? JSON.parse(urlParams.get('config')!) : undefined

  // State
  const [urlsInput, setUrlsInput] = useState('')
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
    cancelBatch,
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

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (!confirm('Are you sure you want to cancel this batch?')) return

    try {
      await cancelBatch()
      toast.success('Batch scrape cancelled')
    } catch (err) {
      toast.error('Failed to cancel batch')
    }
  }, [cancelBatch])

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

  // Handle back to history
  const handleBackToHistory = () => {
    window.location.href = browser.runtime.getURL('/batch-scrape-history.html')
  }

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

  const isRunning = batch?.status === 'running'
  const isPaused = batch?.status === 'paused'
  const isCompleted = batch?.status === 'completed'
  const canStart = batch && batch.status === 'pending'
  const canPause = isRunning
  const canResume = isPaused
  const canCancel = isRunning || isPaused

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        {/* Header */}
        <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <Button variant="ghost" size="sm" onClick={handleBackToHistory}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to History
              </Button>

              {/* Batch name - editable in center */}
              {batch && (
                <div className="flex items-center gap-2 flex-1 justify-center max-w-2xl">
                  <Input
                    placeholder="Batch name"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="text-center font-semibold"
                  />
                  {batchName !== batch.name && (
                    <Button variant="outline" size="sm" onClick={handleNameUpdate}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* Storage indicator */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HardDrive className="h-4 w-4" />
                <span>
                  {(storageUsage.used / 1024 / 1024).toFixed(1)} MB /{' '}
                  {(storageUsage.quota / 1024 / 1024).toFixed(0)} MB
                </span>
                <span>({storageUsage.percentUsed.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
          {/* Show form if no batch yet */}
          {!batch && (
            <>
              {/* Batch name input - only show when creating */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Batch name (optional)"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <BatchUrlInput urls={urlsInput} onChange={setUrlsInput} disabled={isCreating} />
                </div>
                <div className="space-y-6">
                  <BatchConfig config={config} onChange={setConfig} disabled={isCreating} />
                </div>
              </div>
            </>
          )}

          {/* Settings */}
          {!batch && (
            <BatchSettingsComponent
              settings={settings}
              onChange={setSettings}
              disabled={isCreating}
            />
          )}

          {/* Action buttons */}
          {!batch ? (
            <div className="flex justify-end">
              <Button onClick={handleCreateBatch} disabled={isCreating} size="lg">
                Create Batch
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              {canStart && (
                <Button onClick={handleStart} size="lg">
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
              {canPause && (
                <Button onClick={handlePause} variant="outline" size="lg">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              {canResume && (
                <Button onClick={handleResume} size="lg">
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
              )}
              {canCancel && (
                <Button onClick={handleCancel} variant="destructive" size="lg">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          )}

          {/* Progress */}
          {batch && <BatchProgress batch={batch} statistics={statistics} />}

          {/* Results */}
          {batch && combinedResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Results</h2>
                <ExportButtons
                  scrapeResult={{
                    data: combinedResults,
                    columnOrder: ['url', ...config.columns.map((c) => c.name)],
                  }}
                  config={config}
                  showEmptyRows={false}
                  selectedRows={selectedRows}
                  filename={`${batch.name} - ${new Date().toISOString().split('T')[0]}`}
                  variant="outline"
                />
              </div>

              <ResultsTable
                data={combinedResults}
                config={{ ...config, columns: [{ name: 'url', selector: '.' }, ...config.columns] }}
                columnOrder={['url', ...config.columns.map((c) => c.name)]}
                showEmptyRowsToggle={false}
                eventPrefix="BATCH_SCRAPE"
                onSelectedRowsChange={setSelectedRows}
              />
            </div>
          )}
        </main>

        <Footer />
      </ConsentWrapper>
    </div>
  )
}

export default BatchScrapeApp
