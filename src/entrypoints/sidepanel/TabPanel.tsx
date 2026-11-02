import { useShownToast } from '@/hooks/use-shown-toast'
import { isSelectorAPreset } from '@/utils/autosuggest'
import { reportRejection } from '@/utils/report-rejection'
import {
  applyColumnEdit,
  DEFAULT_SCRAPE_CONFIG,
  resolveStoredConfig,
  withTrimmedMainSelector,
} from '@/utils/scrape-config'
import {
  buildConfigReplaceUpdates,
  buildExportFilename,
  buildMainSelectorUpdates,
  hasConfigDrifted,
  reuseIfEqual,
} from '@/utils/sidepanel-state'
import log from 'loglevel'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

export const COLUMN_EDIT_NOT_SAVED =
  'Could not save the column change. The saved columns are shown.'
export const PRESET_NOT_SAVED = 'Could not load the preset. The saved configuration is shown.'
export const MAIN_SELECTOR_NOT_SAVED =
  'Could not save the main selector. The saved configuration is shown.'

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
  const [storedConfigVersion, setStoredConfigVersion] = useState(0)

  const buildFilename = useCallback((now: Date) => buildExportFilename(tabUrl, now), [tabUrl])

  // Every config write the panel sends is numbered, and storage records the
  // number of the last one applied. A stored state recording an earlier number
  // predates a write still on its way, so it is skipped rather than shown: it
  // would put back what the panel already shows as changed, and every column
  // edit built on that would fail its check. States are cumulative, so the one
  // recording the awaited write carries whatever was skipped.
  const lastConfigSeqRef = useRef(0)
  const awaitedConfigSeqRef = useRef(0)
  const inFlightConfigSeqsRef = useRef(new Set<number>())
  // Set wherever the config is, not from an effect: ConfigForm's effects run
  // before this component's, and its held blur commit reads the config from one.
  const shownConfigRef = useRef(config)

  const applyStoredState = useCallback(
    (stored: SidePanelConfig) => {
      const storedSeq = stored.panelConfigSeq ?? 0
      if (storedSeq < awaitedConfigSeqRef.current) {
        log.debug(
          `Skipped stored state for tab ${String(tabId)} older than write ${String(awaitedConfigSeqRef.current)}`,
        )
        return
      }
      // Once it has read storage, a panel opened after earlier ones numbers its writes after theirs.
      lastConfigSeqRef.current = Math.max(lastConfigSeqRef.current, storedSeq)
      log.debug(`Applying stored state for tab ${String(tabId)}:`, stored)
      const storedConfig = resolveStoredConfig(stored)
      // Showing a hidden panel re-reads its storage, which nearly always holds
      // what is already on screen; keeping the same references lets React skip
      // re-rendering the form and the table.
      shownConfigRef.current = storedConfig
      setConfig((previous) => reuseIfEqual(previous, storedConfig))

      const storedResult = stored.scrapeResult
      if (storedResult) {
        setScrapeResult((previous) => reuseIfEqual(previous, storedResult))
        if (stored.resultProducingConfig) {
          const storedProducingConfig = withTrimmedMainSelector(stored.resultProducingConfig)
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
      { watch: (callback) => item.watch(callback), read: () => item.getValue() },
      applyStoredState,
      () => setStoredConfigVersion((version) => version + 1),
    )
  }, [tabId, applyStoredState])

  const saveSidePanelState = (id: number, updates: SidePanelConfigUpdate) => {
    reportRejection(
      browser.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: { tabId: id, updates },
      }),
    )
  }

  const showConfig = (incomingConfig: ScrapeConfig) => {
    const newConfig = withTrimmedMainSelector(incomingConfig)
    const hasMainSelectorChanged = newConfig.mainSelector !== config.mainSelector

    shownConfigRef.current = newConfig
    setConfig(newConfig)

    // The row count belongs to the scrape that produced the current results.
    // Once the config changes it is stale, so drop it instead of letting it
    // resurface (e.g. as "0 found") when the new selector is validated.
    setLastScrapeRowCount(null)

    if (hasMainSelectorChanged) {
      setHighlightMatchCount(undefined)
      setHighlightError(undefined)
    }
    return newConfig
  }

  /**
   * Send a config write, numbered as described at `lastConfigSeqRef`.
   * Resolves to whether it was stored; one that was not is toasted as `failure`.
   */
  const writeConfig = async (
    id: number,
    updates: SidePanelConfigUpdate,
    failure: string,
  ): Promise<boolean> => {
    lastConfigSeqRef.current += 1
    const seq = lastConfigSeqRef.current
    awaitedConfigSeqRef.current = seq
    inFlightConfigSeqsRef.current.add(seq)
    let reply: StatusReply | undefined
    try {
      reply = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
        payload: { tabId: id, updates: { ...updates, panelConfigSeq: seq } },
      })
    } catch (error) {
      reply = { success: false, error: String(error) }
    }
    inFlightConfigSeqsRef.current.delete(seq)
    if (reply?.success === true) return true

    log.error(`Could not store config write ${String(seq)} for tab ${String(id)}:`, reply?.error)
    notify.error(failure, { id: failure })
    const inFlight = [...inFlightConfigSeqsRef.current]
    // A later write is still awaited, or was stored and is already shown.
    if (inFlight.some((other) => other > seq) || awaitedConfigSeqRef.current > seq) return false
    // No stored state will record this write, so wait for the newest write still
    // on its way instead, or for none. The state recording that write may already
    // have arrived and been skipped, so storage is read now as well; the read is
    // skipped in turn if it predates that write.
    awaitedConfigSeqRef.current = inFlight.length > 0 ? Math.max(...inFlight) : 0
    const stored = await sidePanelConfigItem(id).getValue()
    // With nothing stored, show the default config, as a panel opened on this tab would.
    applyStoredState(stored ?? {})
    return false
  }

  // Built on the latest config: ConfigForm's deferred blur commit calls the
  // handler from the render at blur time, which can predate a column edit.
  const handleMainSelectorChange = (mainSelector: string) => {
    const latest = shownConfigRef.current
    const shown = showConfig({ ...latest, mainSelector })
    const updates = buildMainSelectorUpdates(latest.mainSelector, shown.mainSelector)
    if (tabId !== null && updates) {
      reportRejection(writeConfig(tabId, updates, MAIN_SELECTOR_NOT_SAVED))
    }
  }

  const handleColumnEdit = (edit: ColumnEdit) => {
    // The form builds the edit from the config this render passed it, so it always applies.
    showConfig({ ...config, columns: applyColumnEdit(config.columns, edit)! })
    if (tabId !== null) {
      reportRejection(writeConfig(tabId, { columnEdit: edit }, COLUMN_EDIT_NOT_SAVED))
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
      (response: ScrapeReply | undefined) => {
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
        const rowCount = response?.data?.data.length ?? 0
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
      (response: HighlightReply | undefined) => {
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
          return
        }

        if (response?.success === false && response.error) {
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
      (response: StatusReply | undefined) => {
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
      (response: StatusReply | undefined) => {
        if (!response && browser.runtime.lastError) {
          notify.error(CONTENT_SCRIPT_UNREACHABLE)
        } else if (response?.success) {
          log.debug('Picker mode toggled successfully')
        }
      },
    )
  }

  // Highlighting waits for the preset to be stored, so a load that fails
  // leaves neither its highlight on the page nor its match count in storage.
  // A selector committed or another preset loaded while this one was on its way
  // has its own highlight, which this one must not paint over.
  const storePreset = async (id: number, loaded: ScrapeConfig) => {
    const isStored = await writeConfig(id, buildConfigReplaceUpdates(loaded), PRESET_NOT_SAVED)
    const isStillShown = shownConfigRef.current.mainSelector === loaded.mainSelector
    if (isStored && isStillShown && loaded.mainSelector) {
      handleHighlight(loaded.mainSelector)
    }
  }

  const handleLoadPreset = (preset: Preset) => {
    const loaded = showConfig(preset.config)
    if (tabId !== null) {
      reportRejection(storePreset(tabId, loaded))
    }

    // User presets are named by the user, so only a system preset's name and id are sent.
    const isSystem = isSystemPreset(preset)
    trackEvent(ANALYTICS_EVENTS.PRESET_LOAD, {
      [ANALYTICS_PROPERTIES.TYPE]: isSystem ? PRESET_TYPES.SYSTEM : PRESET_TYPES.USER,
      [ANALYTICS_PROPERTIES.PRESET_NAME]: isSystem ? preset.name : null,
      [ANALYTICS_PROPERTIES.PRESET_ID]: isSystem ? preset.id : null,
    })
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 w-full min-w-0 box-border">
      <div className="flex flex-col gap-10 w-full min-w-0 box-border">
        <ConfigForm
          tabId={tabId}
          storedConfigVersion={storedConfigVersion}
          config={config}
          onMainSelectorChange={handleMainSelectorChange}
          onColumnEdit={handleColumnEdit}
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
            !!scrapeResult?.data.length &&
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
                config={resultProducingConfig ?? config}
                showEmptyRows={shouldShowEmptyRows}
                buildFilename={buildFilename}
                variant="outline"
              />
            </div>
            <DataTable
              data={scrapeResult.data}
              onRowHighlight={handleRowHighlight}
              config={resultProducingConfig ?? config}
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
