import { AppHeader } from '@/components/AppHeader'
import { BatchActionButtons } from '@/components/BatchActionButtons'
import ConfigForm from '@/components/ConfigForm'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { Footer } from '@/components/footer'
import ResultsTable from '@/components/ResultsTable'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BatchUrlInput } from '@/entrypoints/batch-scrape/components/BatchUrlInput'
import { UrlProgressTable } from '@/entrypoints/batch-scrape/components/UrlProgressTable'
import { useBatchScrape } from '@/entrypoints/batch-scrape/hooks/useBatchScrape'
import { usePresets } from '@/hooks/usePresets'
import { useVisualPicker } from '@/hooks/useVisualPicker'
import { navigateToBatchHistory } from '@/utils/batch-operations'
import { DEFAULT_BATCH_SETTINGS, getBatchJob, type BatchSettings } from '@/utils/batch-scrape-db'
import { validateAndDeduplicateUrls } from '@/utils/batch-url-utils'
import { getBatchHistoryUrl, getNewBatchUrl } from '@/utils/batch-urls'
import { ArrowLeft, Plus, Save } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const BatchScrapeApp: React.FC = () => {
  // URL params
  const urlParams = new URLSearchParams(window.location.search)
  const batchIdFromUrl = urlParams.get('batchId') || undefined
  const duplicateFromBatchId = urlParams.get('duplicateFromBatchId') || undefined
  const loadFromTabId = urlParams.get('loadFromTabId') || undefined

  // State
  const [urlsInput, setUrlsInput] = useState('')
  const [config, setConfig] = useState<ScrapeConfig>({
    mainSelector: '',
    columns: [{ name: 'Text', selector: '.' }],
  })
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS)
  const [batchName, setBatchName] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [selectedRows, setSelectedRows] = useState<ScrapedRow[]>([])
  const [showPresets, setShowPresets] = useState(false)

  // Use batch scrape hook
  const {
    batch,
    statistics,
    combinedResults,
    createAndStartBatch,
    pauseBatch,
    resumeBatch,
    updateBatchName,
  } = useBatchScrape(batchIdFromUrl)

  // Use presets hook
  const {
    presets,
    getPresetConfig: loadPreset,
    handleSavePreset,
    handleDeletePreset,
  } = usePresets()

  // Wrap handleLoadPreset to update local config state
  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      const newConfig = loadPreset(preset)
      setConfig(newConfig)
    },
    [loadPreset],
  )

  // Use visual picker hook
  const { isPickerActive, openPicker } = useVisualPicker({
    onSelectorPicked: (selector) => {
      setConfig((prev) => ({ ...prev, mainSelector: selector }))
    },
  })

  // Handle picker mode - opens first URL in picker
  const handlePickerMode = useCallback(async () => {
    const validation = validateAndDeduplicateUrls(urlsInput)
    const firstUrl = validation.valid[0]

    if (!firstUrl) {
      toast.error('Add at least one URL first')
      return
    }

    await openPicker(firstUrl)
  }, [urlsInput, openPicker])

  // Load duplication data from Dexie if duplicateFromBatchId is present
  useEffect(() => {
    if (duplicateFromBatchId) {
      getBatchJob(duplicateFromBatchId).then((sourceBatch) => {
        if (sourceBatch) {
          setConfig(sourceBatch.config)
          setUrlsInput(sourceBatch.urls.join('\n'))
          setSettings(sourceBatch.settings)
        } else {
          toast.error('Failed to load batch data for duplication')
        }
      })
    }
  }, [duplicateFromBatchId])

  // Load config from sidepanel session storage if loadFromTabId is present
  useEffect(() => {
    if (loadFromTabId) {
      storage
        .getItem<SidePanelConfig>(`session:sidepanel_config_${loadFromTabId}`)
        .then((sidepanelData) => {
          if (sidepanelData) {
            // Load ALL the data from sidepanel session
            if (sidepanelData.currentScrapeConfig) {
              setConfig(sidepanelData.currentScrapeConfig)
            }
            // Get the tab URL from browser tabs API
            browser.tabs.get(Number(loadFromTabId), (tab) => {
              if (tab?.url && !browser.runtime.lastError) {
                setUrlsInput(tab.url)
              }
            })
          } else {
            toast.error('Failed to load configuration from sidepanel')
          }
        })
    }
  }, [loadFromTabId])

  // Handle create and start batch
  const handleStart = useCallback(async () => {
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
      setIsStarting(true)
      const newBatch = await createAndStartBatch(
        config,
        validation.valid,
        batchName || undefined,
        settings,
      )
      toast.success(`Started batch with ${validation.valid.length} URLs`)

      // Update URL to include batch ID
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('batchId', newBatch.id)
      newUrl.searchParams.delete('duplicateFromBatchId')
      newUrl.searchParams.delete('loadFromTabId')
      window.history.replaceState({}, '', newUrl.toString())
    } catch (err) {
      toast.error('Failed to start batch')
    } finally {
      setIsStarting(false)
    }
  }, [urlsInput, config, settings, batchName, createAndStartBatch])

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

  // Set initial batch name from existing batch
  useEffect(() => {
    if (batch && !batchName) {
      setBatchName(batch.name)
    }
  }, [batch, batchName])

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        <TooltipProvider>
          <AppHeader
            left={
              batch ? (
                // Button group when viewing results
                <ButtonGroup>
                  <Button variant="outline" size="sm" asChild>
                    <a href={getBatchHistoryUrl()}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      History
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={getNewBatchUrl()}>
                      <Plus className="h-4 w-4 mr-2" />
                      New
                    </a>
                  </Button>
                </ButtonGroup>
              ) : (
                // Single button when creating new batch
                <Button variant="outline" size="sm" asChild>
                  <a href={getBatchHistoryUrl()}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to History
                  </a>
                </Button>
              )
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
                settings={settings}
                onSettingsChange={setSettings}
                isStarting={isStarting}
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
                <ConfigForm
                  config={config}
                  onChange={setConfig}
                  isLoading={isStarting}
                  initialOptions={null}
                  presets={presets}
                  onLoadPreset={handleLoadPreset}
                  onSavePreset={(name) => handleSavePreset(name, config)}
                  onDeletePreset={handleDeletePreset}
                  showPresets={showPresets}
                  setShowPresets={setShowPresets}
                  lastScrapeRowCount={null}
                  showPickerButton={true}
                  showScrapeButton={false}
                  onPickerMode={handlePickerMode}
                  pickerModeActive={isPickerActive}
                />

                <BatchUrlInput urls={urlsInput} onChange={setUrlsInput} disabled={isStarting} />
              </>
            )}

            {/* URL Progress Table */}
            {batch && <UrlProgressTable batchId={batch.id} />}

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
