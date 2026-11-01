import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import { TabPanel } from '@/entrypoints/sidepanel/TabPanel'
import { reportRejection } from '@/utils/report-rejection'
import { LIVE_TAB_PANEL_CAP, parseFullDataViewTabId, touchLiveTab } from '@/utils/sidepanel-state'
import { chromeExtensionId } from '@@/package.json' with { type: 'json' }
import log from 'loglevel'
import { Minimize2, X } from 'lucide-react'
import React, { Activity, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

// Simple splash screen component
const SplashScreen: React.FC<{ tabUrl: string }> = ({ tabUrl }) => (
  <div className="flex flex-1 items-center justify-center w-full min-w-0">
    <div className="flex flex-col items-center justify-center text-center w-full max-w-md mx-auto">
      <h2 className="text-2xl mb-4">Unsupported URL</h2>
      <p className="text-lg mb-2">
        For security reasons this extension can't work on{' '}
        <span className="italic">{getInjectableUrlPattern(tabUrl)}</span> pages.
      </p>
      <p className="text-lg mb-2">Try one of these websites:</p>
      <div className="flex flex-col items-left justify-between gap-2 h-full">
        <a href="https://www.wikipedia.org" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img src="/img/favicon-wikipedia.ico" alt="Wikipedia" className="w-4 h-4" /> Wikipedia
          </Card>
        </a>
        <a href="https://www.ourworldindata.org" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img
              src="/img/favicon-ourworldindata.ico"
              alt="Our World in Data"
              className="w-4 h-4"
            />{' '}
            Our World in Data
          </Card>
        </a>
        <a href="https://www.cia.gov/the-world-factbook/" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img
              src="/img/favicon-cia-world-factbook.webp"
              alt="CIA World Factbook"
              className="w-4 h-4"
            />{' '}
            CIA World Factbook
          </Card>
        </a>
        <a href="https://www.imdb.com" target="_blank" rel="noopener">
          <Card className="flex flex-row items-center gap-2 p-2 w-full h-full">
            <img src="/img/favicon-imdb.png" alt="IMDb" className="w-4 h-4" /> IMDb
          </Card>
        </a>
      </div>
    </div>
  </div>
)

// Special view for when the side panel is viewing a full data view tab
const FullDataViewControls: React.FC<{
  currentTabUrl: string
  currentTabId: number | null
}> = ({ currentTabUrl, currentTabId }) => {
  // Handle going back to the original tab and close the full-data-view tab.
  // `parseFullDataViewTabId` reports a URL it cannot read as `null` rather than
  // throwing, so the only failures worth catching are the tab calls below.
  const handleBackToTab = async () => {
    // Parse the full data view URL to get the original tabId
    const tabId = parseFullDataViewTabId(currentTabUrl)

    if (tabId === null) {
      toast.error('No target tab ID found')
      log.error('No tabId parameter found in URL:', currentTabUrl)
      return
    }

    // Validate that the tab exists before trying to switch to it
    try {
      await browser.tabs.get(tabId)
      log.debug(`Tab ${tabId} exists, switching to it`)

      // Switch to the original tab
      await browser.tabs.update(tabId, { active: true })
      log.debug(`Switched back to tab ${tabId}`)

      // Close the current full-data-view tab. This view only renders for a tab
      // the panel resolved, so its id is always known here.
      await browser.tabs.remove(currentTabId!)
      log.debug(`Closed full-data-view tab ${currentTabId}`)
    } catch (tabError) {
      toast.error('Target tab does not exist')
      log.error(`Tab ${tabId} does not exist:`, tabError)
    }
  }

  // Handle closing the sidepanel
  const handleCloseSidePanel = () => {
    window.close()
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-w-0">
      <div className="flex flex-col items-center justify-center text-center w-full max-w-md mx-auto gap-6">
        <h2 className="text-2xl mb-4">Full Screen View Active</h2>

        <div className="flex flex-col gap-4">
          <Button onClick={() => reportRejection(handleBackToTab())}>
            <Minimize2 className="h-4 w-4" />
            Compact View
          </Button>

          <Button onClick={handleCloseSidePanel} variant="outline">
            <X className="h-4 w-4" />
            Hide Sidepanel
          </Button>
        </div>
      </div>
    </div>
  )
}
type TabView = 'panel' | 'full-data-view' | 'unsupported'

/** An unknown URL gets the panel, so a tab still being resolved shows the form. */
const getTabView = (tabUrl: string | null): TabView => {
  if (tabUrl?.startsWith(`chrome-extension://${chromeExtensionId}/full-data-view.html`)) {
    return 'full-data-view'
  }
  return tabUrl !== null && !isInjectableUrl(tabUrl) ? 'unsupported' : 'panel'
}

interface SidePanelProps {
  debugMode: boolean
  onDebugModeChange: (enabled: boolean) => void
}

/**
 * The side panel shell: follows the active tab and keeps a live `TabPanel` for
 * each recently shown one, hidden while its tab is in the background. Only
 * state shared by every tab (presets, the footer's settings) lives here.
 */
export const SidePanel: React.FC<SidePanelProps> = ({ debugMode, onDebugModeChange }) => {
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  // Least recently shown first, so eviction drops from the front.
  const [liveTabIds, setLiveTabIds] = useState<number[]>([])
  const [tabUrls, setTabUrls] = useState<ReadonlyMap<number, string | null>>(new Map())
  const [presets, setPresets] = useState<Preset[]>([])

  const setTabUrl = (tabId: number, url: string | null) =>
    setTabUrls((previous) => new Map(previous).set(tabId, url))

  const showTab = (tabId: number) => {
    setActiveTabId(tabId)
    setLiveTabIds((previous) => touchLiveTab(previous, tabId, LIVE_TAB_PANEL_CAP))
  }

  const reloadPresets = useCallback(() => reportRejection(getAllPresets().then(setPresets)), [])

  useEffect(() => {
    // Use `currentWindow: true` instead of `lastFocusedWindow: true` because the
    // side-panel itself becomes the *last focused* window in certain testing/
    // automation scenarios (e.g. Playwright) - likely due to PW_CHROMIUM_ATTACH_TO_OTHER = '1'.
    // When that happens the query returns an empty array because extension views
    // are not considered *tabs*, causing our fallback error path to trigger.
    // Limiting the query to the *current* window reliably returns the active
    // webpage tab that the side-panel is attached to.
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (browser.runtime.lastError) {
        log.error('Error querying tabs:', browser.runtime.lastError.message)
      } else if (tabs && tabs[0] && tabs[0].id) {
        log.debug(`Got initial tabId directly: ${tabs[0].id}`)
        setTabUrl(tabs[0].id, tabs[0].url || '')
        showTab(tabs[0].id)
      } else {
        log.error('No active tab found in last focused window')
      }
    })

    const tabActivationListener = ({ tabId }: { tabId: number }) => {
      log.debug(`SidePanel detected tab activation: ${tabId}`)
      showTab(tabId)
      browser.tabs.get(tabId, (tab) => {
        if (browser.runtime.lastError) {
          log.error('Error getting tab info:', browser.runtime.lastError)
          setTabUrl(tabId, null)
        } else {
          setTabUrl(tabId, tab.url || '')
        }
      })
    }

    const tabRemovalListener = (tabId: number) => {
      setLiveTabIds((previous) => previous.filter((id) => id !== tabId))
      setTabUrls((previous) => {
        const next = new Map(previous)
        next.delete(tabId)
        return next
      })
    }

    browser.tabs.onActivated.addListener(tabActivationListener)
    browser.tabs.onRemoved.addListener(tabRemovalListener)
    return () => {
      browser.tabs.onActivated.removeListener(tabActivationListener)
      browser.tabs.onRemoved.removeListener(tabRemovalListener)
    }
  }, [])

  // A background tab's URL is read again when it is activated, so only the
  // active tab's navigation is followed.
  useEffect(() => {
    if (activeTabId === null) return
    const tabUpdateListener = (tabId: number) => {
      if (tabId !== activeTabId) return
      browser.tabs.get(tabId, (updatedTab) => {
        setTabUrl(tabId, browser.runtime.lastError ? '' : updatedTab.url || '')
      })
    }
    browser.tabs.onUpdated.addListener(tabUpdateListener)
    return () => browser.tabs.onUpdated.removeListener(tabUpdateListener)
  }, [activeTabId])

  // Presets are shared by every tab; this also follows changes made from
  // another extension page (a preset saved or a system preset hidden).
  useEffect(() => {
    reloadPresets()
    const unwatchUserPresets = userPresetsItem.watch(reloadPresets)
    const unwatchSystemPresetStatus = systemPresetStatusItem.watch(reloadPresets)
    return () => {
      unwatchUserPresets()
      unwatchSystemPresetStatus()
    }
  }, [reloadPresets])

  const handleSavePreset = async (config: ScrapeConfig, name: string) => {
    const preset: Preset = {
      id: Date.now().toString(),
      name,
      config,
      createdAt: Date.now(),
    }
    // `savePreset` reports its own storage failures as `false`, so a rejection
    // is not something that can reach here.
    const isSaved = await savePreset(preset)
    if (isSaved) {
      setPresets(await getAllPresets())
      log.debug('Preset saved successfully and UI updated')
      trackEvent(ANALYTICS_EVENTS.PRESET_SAVE, {
        type: 'user',
        columns_count: config.columns.length,
      })
    } else {
      log.error('Failed to save preset')
    }
  }

  // A system preset is hidden rather than deleted.
  const handleDeletePreset = async (preset: Preset) => {
    if (isSystemPreset(preset)) {
      const statusMap = await getSystemPresetStatus()
      statusMap[preset.id] = false
      await setSystemPresetStatus(statusMap)
      toast.success(`System preset "${preset.name}" hidden.`)
      setPresets(await getAllPresets())
      trackEvent(ANALYTICS_EVENTS.PRESET_HIDE, {
        type: 'system',
        preset_name: preset.name,
        preset_id: preset.id,
      })
      return
    }
    // `deletePreset` reports a storage failure as `false` rather than rejecting.
    const isDeleted = await deletePreset(preset.id)
    if (isDeleted) {
      setPresets(await getAllPresets())
      toast.success(
        <>
          Preset "<span className="ph_hidden">{preset.name}</span>" deleted
        </>,
      )
      trackEvent(ANALYTICS_EVENTS.PRESET_DELETION, {
        type: 'user',
      })
    } else {
      toast.error(
        <>
          Error, preset "<span className="ph_hidden">{preset.name}</span>" couldn't be deleted
        </>,
      )
    }
  }

  const handleResetSystemPresets = async () => {
    await setSystemPresetStatus({})
    setPresets(await getAllPresets())
    toast.success('System presets have been reset')
    trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET, {
      type: 'system',
    })
  }

  const tabUrl = activeTabId === null ? null : (tabUrls.get(activeTabId) ?? null)
  const view = getTabView(tabUrl)

  const tabPanelProps = {
    presets,
    onSavePreset: handleSavePreset,
    onDeletePreset: (preset: Preset) => reportRejection(handleDeletePreset(preset)),
  }

  return (
    <div className="flex flex-col h-screen font-sans min-w-0 max-w-full w-full box-border">
      <Toaster />
      <ConsentWrapper>
        {view === 'full-data-view' && (
          <main className="flex-1 flex min-w-0 w-full">
            <FullDataViewControls currentTabUrl={tabUrl!} currentTabId={activeTabId} />
          </main>
        )}
        {view === 'unsupported' && (
          <main className="flex-1 flex min-w-0 w-full">
            <SplashScreen tabUrl={tabUrl!} />
          </main>
        )}
        {activeTabId === null && <TabPanel tabId={null} tabUrl={null} {...tabPanelProps} />}
        {/* A tab on a page the panel cannot work on has no panel to keep. */}
        {liveTabIds
          .filter((tabId) => getTabView(tabUrls.get(tabId) ?? null) === 'panel')
          .map((tabId) => (
            <Activity key={tabId} mode={tabId === activeTabId ? 'visible' : 'hidden'}>
              <TabPanel tabId={tabId} tabUrl={tabUrls.get(tabId) ?? null} {...tabPanelProps} />
            </Activity>
          ))}
      </ConsentWrapper>
      {view !== 'full-data-view' && (
        <Footer
          showSettings={true}
          onResetSystemPresets={() => reportRejection(handleResetSystemPresets())}
          onPresetsImported={reloadPresets}
          debugMode={debugMode}
          onDebugModeChange={onDebugModeChange}
        />
      )}
    </div>
  )
}
