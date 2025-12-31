import { AppHeader } from '@/components/AppHeader'
import { BatchUrlInput } from '@/components/BatchUrlInput'
import ConfigForm from '@/components/ConfigForm'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePresets } from '@/hooks/usePresets'
import { useVisualPicker } from '@/hooks/useVisualPicker'
import { DEFAULT_BATCH_SETTINGS, getBatchJob, type BatchSettings } from '@/utils/batch-scrape-db'
import { validateAndDeduplicateUrls } from '@/utils/batch-url-utils'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const NewScrapePage: React.FC = () => {
  // Get search params from router
  const search = useSearch({ from: '/scrapes/new' })
  const duplicateFromBatchId = search.from
  const loadFromTabId = search.tab

  const navigate = useNavigate()

  // State
  const [urlsInput, setUrlsInput] = useState('')
  const [config, setConfig] = useState<ScrapeConfig>({
    mainSelector: '',
    columns: [{ name: 'Text', selector: '.' }],
  })
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS)
  const [batchName, setBatchName] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

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

      // Create batch job
      const batchId = crypto.randomUUID()
      const newBatch: BatchScrapeJob = {
        id: batchId,
        name: batchName || `Batch ${new Date().toLocaleString()}`,
        config,
        urls: validation.valid,
        status: 'pending',
        settings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        statistics: {
          total: validation.valid.length,
          pending: validation.valid.length,
          running: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          totalRows: 0,
        },
      }

      await batchScrapeDb.batches.add(newBatch)

      // Start the batch
      await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.BATCH_SCRAPE_START,
        payload: { batchId },
      })

      toast.success(`Started batch with ${validation.valid.length} URLs`)

      // Navigate to the batch detail page
      navigate({
        to: '/scrapes/$id',
        params: { id: batchId },
      })
    } catch (err) {
      toast.error('Failed to start batch')
    } finally {
      setIsStarting(false)
    }
  }, [urlsInput, config, settings, batchName, navigate])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster />
      <ConsentWrapper>
        <TooltipProvider>
          <AppHeader
            left={
              <Button variant="outline" size="sm" asChild>
                <Link to="/scrapes">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Batches
                </Link>
              </Button>
            }
            center={
              <div className="relative w-96">
                <Input
                  placeholder="Batch name (optional)"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="text-center font-semibold"
                />
              </div>
            }
            right={
              <Button onClick={handleStart} disabled={isStarting}>
                {isStarting ? 'Starting...' : 'Start Batch'}
              </Button>
            }
          />

          {/* Main content */}
          <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
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
          </main>

          <Footer />
        </TooltipProvider>
      </ConsentWrapper>
    </div>
  )
}

export default NewScrapePage
