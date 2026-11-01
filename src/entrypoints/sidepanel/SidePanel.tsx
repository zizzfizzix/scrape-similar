import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Toaster } from '@/components/ui/sonner'
import {
  getTabView,
  INITIAL_TAB_PANELS_STATE,
  tabPanelsReducer,
} from '@/entrypoints/sidepanel/tab-panels'
import { TabPanel } from '@/entrypoints/sidepanel/TabPanel'
import { reportRejection } from '@/utils/report-rejection'
import { parseFullDataViewTabId } from '@/utils/sidepanel-state'
import log from 'loglevel'
import { Minimize2, X } from 'lucide-react'
import React, { Activity, useCallback, useEffect, useReducer, useRef, useState } from 'react'
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
  const [{ activeTabId, liveTabIds, tabUrls }, dispatch] = useReducer(
    tabPanelsReducer,
    INITIAL_TAB_PANELS_STATE,
  )
  const [presets, setPresets] = useState<Preset[]>([])
  // The window this panel belongs to: `undefined` until known, `null` when it
  // could not be read, in which case activations in every window are followed.
  const windowIdRef = useRef<number | null | undefined>(undefined)
  // The last tab activated in each window before this panel knew its own.
  const pendingActivationsRef = useRef(new Map<number, number>())

  const reloadPresets = useCallback(() => reportRejection(getAllPresets().then(setPresets)), [])

  useEffect(() => {
    // The tab is shown only once its URL is known, so a tab on an unsupported
    // page never mounts a panel first.
    const activate = (tabId: number) => {
      browser.tabs.get(tabId, (tab) => {
        // A tab that cannot be read has usually just closed, and showing it
        // would bring back the panel `onRemoved` dropped.
        if (browser.runtime.lastError) {
          log.error('Error getting tab info:', browser.runtime.lastError)
        } else {
          dispatch({ type: 'activated', tabId, url: tab.url || '' })
        }
      })
    }

    const resolveWindow = (windowId: number | null) => {
      windowIdRef.current = windowId
      const pending = pendingActivationsRef.current
      // With its window unknown, the latest activation anywhere is the best guess.
      const tabId = windowId === null ? [...pending.values()].at(-1) : pending.get(windowId)
      pending.clear()
      if (tabId !== undefined) activate(tabId)
    }

    // Use `currentWindow: true` instead of `lastFocusedWindow: true` because the
    // side-panel itself becomes the *last focused* window in certain testing/
    // automation scenarios (e.g. Playwright) - likely due to PW_CHROMIUM_ATTACH_TO_OTHER = '1'.
    // When that happens the query returns an empty array because extension views
    // are not considered *tabs*, causing our fallback error path to trigger.
    // Limiting the query to the *current* window reliably returns the active
    // webpage tab that the side-panel is attached to.
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0]
      if (browser.runtime.lastError) {
        log.error('Error querying tabs:', browser.runtime.lastError.message)
      } else if (tab?.id) {
        log.debug(`Got initial tabId directly: ${tab.id}`)
        dispatch({ type: 'activated', tabId: tab.id, url: tab.url || '' })
      } else {
        log.error('No active tab found in last focused window')
      }
      resolveWindow(tab?.windowId ?? null)
    })

    // Every window has its own side panel, which follows only its own tabs.
    const tabActivationListener = ({ tabId, windowId }: { tabId: number; windowId: number }) => {
      log.debug(`SidePanel detected tab activation: ${tabId}`)
      if (windowIdRef.current === undefined) {
        // Re-inserted so the map's order stays the order of activation.
        pendingActivationsRef.current.delete(windowId)
        pendingActivationsRef.current.set(windowId, tabId)
      } else if (windowIdRef.current === null || windowId === windowIdRef.current) {
        activate(tabId)
      }
    }

    const tabUpdateListener = (tabId: number, { url }: { url?: string }) => {
      if (url !== undefined) dispatch({ type: 'navigated', tabId, url })
    }

    const tabRemovalListener = (tabId: number) => dispatch({ type: 'removed', tabId })

    browser.tabs.onActivated.addListener(tabActivationListener)
    browser.tabs.onUpdated.addListener(tabUpdateListener)
    browser.tabs.onRemoved.addListener(tabRemovalListener)
    return () => {
      browser.tabs.onActivated.removeListener(tabActivationListener)
      browser.tabs.onUpdated.removeListener(tabUpdateListener)
      browser.tabs.onRemoved.removeListener(tabRemovalListener)
    }
  }, [])

  // Presets are shared by every tab. The watchers pick up every change, made
  // here or from another extension page, so the handlers below only write;
  // reloading in both places would re-render every live panel twice.
  useEffect(() => {
    reloadPresets()
    const unwatchUserPresets = userPresetsItem.watch(reloadPresets)
    const unwatchSystemPresetStatus = systemPresetStatusItem.watch(reloadPresets)
    return () => {
      unwatchUserPresets()
      unwatchSystemPresetStatus()
    }
  }, [reloadPresets])

  // Stable, so a hidden TabPanel is not re-rendered by a change in the shell.
  const handleSavePreset = useCallback(async (config: ScrapeConfig, name: string) => {
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
      log.debug('Preset saved successfully and UI updated')
      trackEvent(ANALYTICS_EVENTS.PRESET_SAVE, {
        type: 'user',
        columns_count: config.columns.length,
      })
    } else {
      log.error('Failed to save preset')
    }
  }, [])

  // A system preset is hidden rather than deleted.
  const handleDeletePreset = useCallback(async (preset: Preset) => {
    if (isSystemPreset(preset)) {
      const statusMap = await getSystemPresetStatus()
      statusMap[preset.id] = false
      await setSystemPresetStatus(statusMap)
      toast.success(`System preset "${preset.name}" hidden.`)
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
  }, [])

  const handleResetSystemPresets = async () => {
    await setSystemPresetStatus({})
    toast.success('System presets have been reset')
    trackEvent(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET, {
      type: 'system',
    })
  }

  // The active tab and every live one were shown, so their URLs are known.
  const tabUrl = activeTabId === null ? null : tabUrls.get(activeTabId)!
  const view = getTabView(tabUrl)

  const handleDeletePresetReported = useCallback(
    (preset: Preset) => reportRejection(handleDeletePreset(preset)),
    [handleDeletePreset],
  )
  const tabPanelProps = {
    presets,
    onSavePreset: handleSavePreset,
    onDeletePreset: handleDeletePresetReported,
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
        {/* In a fixed order: reordering would move a panel's DOM on every switch. */}
        {[...liveTabIds]
          .sort((a, b) => a - b)
          .map((tabId) => (
            <Activity
              key={tabId}
              mode={tabId === activeTabId && view === 'panel' ? 'visible' : 'hidden'}
            >
              <TabPanel tabId={tabId} tabUrl={tabUrls.get(tabId)!} {...tabPanelProps} />
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
