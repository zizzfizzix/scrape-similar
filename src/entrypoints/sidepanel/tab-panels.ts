import { isInjectableUrl } from '@/utils/isInjectableUrl'
import { LIVE_TAB_PANEL_CAP, touchLiveTab } from '@/utils/sidepanel-state'
import { chromeExtensionId } from '@@/package.json' with { type: 'json' }

export type TabView = 'panel' | 'full-data-view' | 'unsupported'

/** No tab at all (`null`) gets the panel, so the form shows before a tab is resolved. */
export const getTabView = (tabUrl: string | null): TabView => {
  if (tabUrl?.startsWith(`chrome-extension://${chromeExtensionId}/full-data-view.html`)) {
    return 'full-data-view'
  }
  return tabUrl !== null && !isInjectableUrl(tabUrl) ? 'unsupported' : 'panel'
}

export interface TabPanelsState {
  activeTabId: number | null
  /**
   * Tabs that keep a `TabPanel`, least recently shown first. A tab joins once
   * it is shown on a page the panel works on and stays while it visits other
   * pages, so leaving and coming back does not lose its unsaved state.
   */
  liveTabIds: readonly number[]
  tabUrls: ReadonlyMap<number, string>
}

export type TabPanelsAction =
  | { type: 'activated'; tabId: number; url: string }
  | { type: 'navigated'; tabId: number; url: string }
  | { type: 'removed'; tabId: number }

export const INITIAL_TAB_PANELS_STATE: TabPanelsState = {
  activeTabId: null,
  liveTabIds: [],
  tabUrls: new Map(),
}

const show = (state: TabPanelsState, tabId: number, url: string): TabPanelsState => {
  const isLive = getTabView(url) === 'panel' || state.liveTabIds.includes(tabId)
  return {
    activeTabId: tabId,
    liveTabIds: isLive
      ? touchLiveTab(state.liveTabIds, tabId, LIVE_TAB_PANEL_CAP)
      : state.liveTabIds,
    tabUrls: new Map(state.tabUrls).set(tabId, url),
  }
}

export const tabPanelsReducer = (
  state: TabPanelsState,
  action: TabPanelsAction,
): TabPanelsState => {
  switch (action.type) {
    case 'activated':
      return show(state, action.tabId, action.url)
    case 'navigated':
      // Only tabs this panel has shown are tracked.
      if (!state.tabUrls.has(action.tabId) || state.tabUrls.get(action.tabId) === action.url) {
        return state
      }
      // A background tab is shown from a fresh read when activated, so only
      // the active tab's navigation can add a panel.
      if (action.tabId === state.activeTabId) return show(state, action.tabId, action.url)
      return { ...state, tabUrls: new Map(state.tabUrls).set(action.tabId, action.url) }
    case 'removed':
      return {
        // Until the next activation, a closed active tab leaves no tab to show.
        activeTabId: state.activeTabId === action.tabId ? null : state.activeTabId,
        liveTabIds: state.liveTabIds.filter((id) => id !== action.tabId),
        tabUrls: new Map([...state.tabUrls].filter(([id]) => id !== action.tabId)),
      }
  }
}
