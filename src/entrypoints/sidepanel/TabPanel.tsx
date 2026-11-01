import { useShownToast } from '@/hooks/use-shown-toast'
import { isSelectorAPreset } from '@/utils/autosuggest'
import { reportRejection } from '@/utils/report-rejection'
import {
  buildConfigChangeUpdates,
  buildExportFilename,
  DEFAULT_SCRAPE_CONFIG,
  hasConfigDrifted,
  resolveStoredConfig,
  reuseIfEqual,
} from '@/utils/sidepanel-state'
import log from 'loglevel'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

export const CONTENT_SCRIPT_UNREACHABLE =
  'Could not connect to the content script. Please reload the page or ensure the extension is enabled for this site.'

interface TabPanelProps {
  /** `null` while the panel has no tab to talk to; nothing is sent or stored then. */
  tabId: number | null
  tabUrl: string | null
  presets: Preset[]
  onSavePreset: (config: ScrapeConfig, name: string) => Promise<void>
  onDeletePreset: (preset: Preset) => void
}

/**
 * Everything the side panel shows for one tab.
 *
 * The panel keeps one of these per tab and hides the inactive ones, so state
 * that is never persisted (drafts, open drawers, the table page) survives a tab
 * switch and cannot reach another tab. Memoised, so a tab switch re-renders
 * only the shell rather than every hidden panel.
 */
export const TabPanel = memo(function TabPanel({
  tabId,
  tabUrl,
  presets,
  onSavePreset,
  onDeletePreset,
}: TabPanelProps) {
  const [config, setConfig] = useState<ScrapeConfig>(DEFAULT_SCRAPE_CONFIG)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [resultProducingConfig, setResultProducingConfig] = useState<ScrapeConfig | null>(null)
  const [isScraping, setIsScraping] = useState(false)
  const [shouldShowPresets, setShouldShowPresets] = useState(false)
  const [lastScrapeRowCount, setLastScrapeRowCount] = useState<number | null>(null)
  const clearLastScrapeRowCount = useCallback(() => setLastScrapeRowCount(null), [])
  const dataTableRef = useRef<HTMLDivElement | null>(null)
  const [highlightMatchCount, setHighlightMatchCount] = useState<number | undefined>(undefined)
  const [highlightError, setHighlightError] = useState<string | undefined>(undefined)
  const [shouldShowEmptyRows, setShouldShowEmptyRows] = useState(false)
  const [isPickerModeActive, setIsPickerModeActive] = useState(false)
  const notify = useShownToast()

  const buildFilename = useCallback((now: Date) => buildExportFilename(tabUrl, now), [tabUrl])

  const applyStoredState = useCallback(
    (stored: SidePanelConfig) => {
      log.debug(`Applying stored state for tab ${tabId}:`, stored)
      const storedConfig = resolveStoredConfig(stored)
      // Showing a hidden panel re-reads its storage, which nearly always holds
      // what is already on screen; keeping the same references lets React skip
      // re-rendering the form and the table.
      setConfig((previous) => reuseIfEqual(previous, storedConfig))

      const storedResult = stored.scrapeResult
      if (storedResult) {
        setScrapeResult((previous) => reuseIfEqual(previous, storedResult))
        const storedProducingConfig = stored.resultProducingConfig
        if (storedProducingConfig) {
          setResultProducingConfig((previous) => reuseIfEqual(previous, storedProducingConfig))
        }
      } else {
        setScrapeResult(null)
        setResultProducingConfig(null)
      }

      setHighlightMatchCount(stored.highlightMatchCount ?? undefined)
      setHighlightError(stored.highlightError ?? undefined)
      setIsPickerModeActive(stored.pickerModeActive ?? false)
    },
    [tabId],
  )

  // Effects stop while the panel is hidden; the backfill read on showing it
  // again picks up whatever was written in the meantime (an auto-scrape
  // finishing, a context-menu selection).
  useEffect(() => {
    if (tabId === null) return
    const item = sidePanelConfigItem(tabId)
    return subscribeWithBackfill<SidePanelConfig>(
      { watch: item.watch, read: item.getValue },
      applyStoredState,
    )
  }, [tabId, applyStoredState])

  const saveSidePanelState = (id: number, updates: Partial<SidePanelConfig>) => {
    reportRejection(
      browser.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: { tabId: id, updates },
      }),
    )
  }

  const handleConfigChange = (newConfig: ScrapeConfig) => {
    const hasMainSelectorChanged = newConfig.mainSelector !== config.mainSelector

    setConfig(newConfig)

    // The row count belongs to the scrape that produced the current results.
    // Once the config changes it is stale, so drop it instead of letting it
    // resurface (e.g. as "0 found") when the new selector is validated.
    setLastScrapeRowCount(null)

    if (hasMainSelectorChanged) {
      setHighlightMatchCount(undefined)
      setHighlightError(undefined)
    }

    if (tabId !== null) {
      // Also resets the persisted highlight result when the main selector
      // changed, so the storage watcher can't restore a stale match count.
      saveSidePanelState(tabId, buildConfigChangeUpdates(config, newConfig))
    }
  }

  // The button only scrapes a selector the page has already matched, and that
  // match comes from the content script, so a tab is always attached by here
  // and the selector is never blank.
  const handleScrape = () => {
    setShouldShowPresets(false)
    const id = tabId!
    setIsScraping(true)
    const configAtScrapeTime = config
    browser.tabs.sendMessage(
      id,
      { type: MESSAGE_TYPES.START_SCRAPE, payload: config },
      (response) => {
        setIsScraping(false)
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
          setLastScrapeRowCount(null)
          return
        }
        if (response?.error) {
          notify.error(response.error)
          setLastScrapeRowCount(null)
          log.error('Error during scrape:', response.error)
          return
        }
        const rowCount = response?.data?.data?.length ?? 0
        if (response?.success === true) {
          setResultProducingConfig(configAtScrapeTime)
          saveSidePanelState(id, { resultProducingConfig: configAtScrapeTime })
          // Selectors validated by the picker, the context menu or an earlier session
          // never reach handleHighlight, so the scrape feeds the recents as well.
          if (rowCount > 0 && !isSelectorAPreset(configAtScrapeTime.mainSelector, presets)) {
            reportRejection(pushRecentMainSelector(configAtScrapeTime.mainSelector))
          }
        }
        setLastScrapeRowCount(rowCount)
      },
    )
  }

  // Effects re-run each time a hidden panel is shown again, so the count last
  // scrolled to is kept to scroll only for rows that are new.
  const scrapedRowCount = scrapeResult?.data.length ?? 0
  const scrolledRowCountRef = useRef(0)
  useEffect(() => {
    const hasNewRows = scrapedRowCount > 0 && scrapedRowCount !== scrolledRowCountRef.current
    scrolledRowCountRef.current = scrapedRowCount
    if (hasNewRows) {
      // The table renders whenever there are rows, so its ref is attached.
      dataTableRef.current!.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrapedRowCount])

  const handleHighlight = (selector: string) => {
    if (tabId === null) return
    browser.tabs.sendMessage(
      tabId,
      { type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector } },
      (response) => {
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
          return
        }

        if (response && response.success === false && response.error) {
          setHighlightMatchCount(undefined)
          setHighlightError(response.error)
          saveSidePanelState(tabId, { highlightMatchCount: null, highlightError: response.error })
        } else if (response && typeof response.matchCount === 'number') {
          setHighlightMatchCount(response.matchCount)
          setHighlightError(undefined)
          saveSidePanelState(tabId, {
            highlightMatchCount: response.matchCount,
            highlightError: null,
          })
          // Only a selector that matched elements is remembered, so one that fails
          // to parse or matches nothing never becomes a suggestion.
          if (response.matchCount > 0 && !isSelectorAPreset(selector, presets)) {
            reportRejection(pushRecentMainSelector(selector))
          }
        }
      },
    )
  }

  // Only the results table calls this, and results only exist once a tab has
  // been resolved and its stored state read, so the id is always known here.
  const handleRowHighlight = (selector: string) => {
    browser.tabs.sendMessage(
      tabId!,
      { type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT, payload: { selector } },
      (response) => {
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
        }
      },
    )
  }

  const handlePickerMode = () => {
    if (tabId === null) return
    browser.tabs.sendMessage(
      tabId,
      { type: MESSAGE_TYPES.TOGGLE_PICKER_MODE, payload: { source: ANALYTICS_SOURCES.BUTTON } },
      (response) => {
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
        } else if (response && response.success) {
          log.debug('Picker mode toggled successfully')
        }
      },
    )
  }

  const handleLoadPreset = (preset: Preset) => {
    handleConfigChange(preset.config)

    if (preset.config.mainSelector) {
      handleHighlight(preset.config.mainSelector)
    }

    trackEvent(ANALYTICS_EVENTS.PRESET_LOAD, {
      type: isSystemPreset(preset) ? 'system' : 'user',
      preset_name: isSystemPreset(preset) ? preset.name : null,
      preset_id: isSystemPreset(preset) ? preset.id : null,
    })
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 w-full min-w-0 box-border">
      <div className="flex flex-col gap-10 w-full min-w-0 box-border">
        <ConfigForm
          config={config}
          onChange={handleConfigChange}
          onScrape={handleScrape}
          onHighlight={handleHighlight}
          onPickerMode={handlePickerMode}
          isLoading={isScraping}
          presets={presets}
          onLoadPreset={handleLoadPreset}
          onSavePreset={(name) => onSavePreset(config, name)}
          onDeletePreset={onDeletePreset}
          showPresets={shouldShowPresets}
          setShowPresets={setShouldShowPresets}
          lastScrapeRowCount={lastScrapeRowCount}
          onClearLastScrapeRowCount={clearLastScrapeRowCount}
          highlightMatchCount={highlightMatchCount}
          highlightError={highlightError}
          pickerModeActive={isPickerModeActive}
          rescrapeAdvised={
            !!scrapeResult?.data?.length &&
            !!resultProducingConfig &&
            hasConfigDrifted(config, resultProducingConfig)
          }
        />
        {scrapeResult && scrapeResult.data.length > 0 && (
          <div className="flex flex-col gap-6" ref={dataTableRef}>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold">Extracted Data</h2>
              <ExportButtons
                scrapeResult={scrapeResult}
                config={resultProducingConfig || config}
                showEmptyRows={shouldShowEmptyRows}
                buildFilename={buildFilename}
                variant="outline"
              />
            </div>
            <DataTable
              data={scrapeResult.data}
              onRowHighlight={handleRowHighlight}
              config={resultProducingConfig || config}
              columnOrder={scrapeResult.columnOrder}
              showEmptyRows={shouldShowEmptyRows}
              onShowEmptyRowsChange={setShouldShowEmptyRows}
              tabId={tabId}
            />
          </div>
        )}
      </div>
    </main>
  )
})
