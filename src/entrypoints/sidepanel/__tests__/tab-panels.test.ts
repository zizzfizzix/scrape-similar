import {
  getTabView,
  INITIAL_TAB_PANELS_STATE,
  LIVE_TAB_PANEL_CAP,
  tabPanelsReducer,
  touchLiveTab,
  type TabPanelsAction,
  type TabPanelsState,
} from '@/entrypoints/sidepanel/tab-panels'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const PAGE = 'https://example.com/'
const SETTINGS = 'chrome://settings'

const run = (...actions: TabPanelsAction[]): TabPanelsState =>
  actions.reduce(tabPanelsReducer, INITIAL_TAB_PANELS_STATE)

const activated = (tabId: number, url: string): TabPanelsAction => ({
  type: 'activated',
  tabId,
  url,
})
const navigated = (tabId: number, url: string): TabPanelsAction => ({
  type: 'navigated',
  tabId,
  url,
})

describe('getTabView', () => {
  it('gives the panel when there is no tab yet', () => {
    expect(getTabView(null)).toBe('panel')
  })

  it('tells the full data view, an unsupported page and a supported one apart', () => {
    expect(getTabView(fakeBrowser.runtime.getURL('/full-data-view.html?tabId=1'))).toBe(
      'full-data-view',
    )
    expect(getTabView(SETTINGS)).toBe('unsupported')
    expect(getTabView(PAGE)).toBe('panel')
  })

  it('recognises the full data view under a Firefox extension origin', () => {
    const origin = 'moz-extension://0b7c1f2e-5a4d-4e8b-9c3a-1d2e3f4a5b6c'
    spyOnBrowser(fakeBrowser.runtime, 'getURL').mockImplementation(
      (path: string) => `${origin}${path}`,
    )

    expect(getTabView(`${origin}/full-data-view.html?tabId=1`)).toBe('full-data-view')
  })
})

describe('tabPanelsReducer', () => {
  it('gives a tab on a supported page a panel when it is shown', () => {
    expect(run(activated(1, PAGE))).toMatchObject({ activeTabId: 1, liveTabIds: [1] })
  })

  it('gives no panel to a tab first shown on an unsupported page', () => {
    expect(run(activated(1, SETTINGS))).toMatchObject({ activeTabId: 1, liveTabIds: [] })
  })

  it('keeps a panel while its tab visits an unsupported page', () => {
    const state = run(activated(1, PAGE), navigated(1, SETTINGS))

    expect(state.liveTabIds).toEqual([1])
    expect(state.tabUrls.get(1)).toBe(SETTINGS)
  })

  it('evicts the least recently shown panel past the cap', () => {
    const shown = Array.from({ length: LIVE_TAB_PANEL_CAP + 1 }, (_, tabId) =>
      activated(tabId, PAGE),
    )

    expect(run(...shown).liveTabIds).toEqual(shown.slice(1).map((action) => action.tabId))
  })

  it('ignores navigation in a tab it has not shown', () => {
    const state = run(activated(1, PAGE))

    expect(tabPanelsReducer(state, navigated(2, PAGE))).toBe(state)
  })

  it('ignores navigation that does not change the URL', () => {
    const state = run(activated(1, PAGE))

    expect(tabPanelsReducer(state, navigated(1, PAGE))).toBe(state)
  })

  it('gives the active tab a panel once it navigates to a supported page', () => {
    expect(run(activated(1, SETTINGS), navigated(1, PAGE)).liveTabIds).toEqual([1])
  })

  it('records a background tab’s navigation without giving it a panel', () => {
    const state = run(activated(1, SETTINGS), activated(2, PAGE), navigated(1, PAGE))

    expect(state.tabUrls.get(1)).toBe(PAGE)
    expect(state.liveTabIds).toEqual([2])
    expect(state.activeTabId).toBe(2)
  })

  it('forgets a closed tab', () => {
    const state = run(activated(1, PAGE), activated(2, PAGE), { type: 'removed', tabId: 1 })

    expect(state.liveTabIds).toEqual([2])
    expect(state.tabUrls.has(1)).toBe(false)
    expect(state.activeTabId).toBe(2)
  })
  it('leaves no active tab when the active one closes', () => {
    expect(run(activated(1, PAGE), { type: 'removed', tabId: 1 }).activeTabId).toBeNull()
  })

  it('ignores the closing of a tab it has not shown', () => {
    const state = run(activated(1, PAGE))

    expect(tabPanelsReducer(state, { type: 'removed', tabId: 2 })).toBe(state)
  })
})

describe('touchLiveTab', () => {
  it('adds a new tab as the most recent', () => {
    expect(touchLiveTab([1, 2], 3, 10)).toEqual([1, 2, 3])
  })

  it('moves a tab that is already live to the end', () => {
    expect(touchLiveTab([1, 2, 3], 1, 10)).toEqual([2, 3, 1])
  })

  it('drops the least recently shown tabs past the cap', () => {
    expect(touchLiveTab([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
  })
})
