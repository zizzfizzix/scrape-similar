import log from 'loglevel'

/**
 * Gathering and selecting the scraped data the full data view shows.
 *
 * Split out of `FullDataViewApp.tsx` so the per-tab scan, the fallback rules for
 * which tab to show, and the column sizing can be checked without a table.
 */

/** One tab's scrape, as the view needs it. */
export interface TabData {
  tabId: number
  tabUrl: string
  tabTitle: string
  scrapeResult: ScrapeResult
  config: ScrapeConfig
}

/** Config assumed when a tab has data but no record of what produced it. */
const FALLBACK_CONFIG: ScrapeConfig = {
  mainSelector: '',
  columns: [{ name: 'Text', selector: '.' }],
}

/**
 * The config the stored data is actually laid out by.
 *
 * The producing config wins over the currently editable one: column keys and
 * the main selector only describe the rows that were scraped with them.
 */
export const resolveTabConfig = (state: SidePanelConfig): ScrapeConfig =>
  state.resultProducingConfig || state.currentScrapeConfig || FALLBACK_CONFIG

export const hasScrapedRows = (state: SidePanelConfig | null): boolean =>
  !!state?.scrapeResult?.data && state.scrapeResult.data.length > 0

/**
 * Scan every tab for stored scrape results.
 *
 * A tab whose state cannot be read is skipped rather than failing the scan: one
 * unreadable tab should not blank the whole view.
 */
export const collectTabsWithData = async (
  tabs: Browser.tabs.Tab[],
  readSessionState: (tabId: number) => Promise<SidePanelConfig | null>,
): Promise<TabData[]> => {
  const tabsWithData: TabData[] = []

  for (const tab of tabs) {
    if (!tab.id) continue

    try {
      const state = await readSessionState(tab.id)
      if (!hasScrapedRows(state)) continue

      tabsWithData.push({
        tabId: tab.id,
        tabUrl: tab.url || 'Unknown URL',
        tabTitle: tab.title || 'Unknown Title',
        scrapeResult: state!.scrapeResult!,
        config: resolveTabConfig(state!),
      })
    } catch (error) {
      log.warn(`Error loading data for tab ${tab.id}:`, error)
    }
  }

  return tabsWithData
}

export interface TabSelection {
  tabId: number | null
  data: TabData | null
}

/**
 * Which tab the view should show after a scan.
 *
 * Prefers the requested tab; falls back to the first tab that has data, and to
 * nothing at all when none does.
 */
export const resolveTabSelection = (
  tabsWithData: TabData[],
  requestedTabId: number | null,
): TabSelection => {
  const requested = requestedTabId
    ? tabsWithData.find((data) => data.tabId === requestedTabId)
    : undefined
  if (requested) return { tabId: requested.tabId, data: requested }

  const [first] = tabsWithData
  if (first) return { tabId: first.tabId, data: first }

  return { tabId: null, data: null }
}

export const visibleRows = (rows: ScrapedRow[], showEmptyRows: boolean): ScrapedRow[] =>
  showEmptyRows ? rows : rows.filter((row) => !row.metadata.isEmpty)

/** The tab id the view was opened for, or null when the URL names none. */
export const parseRequestedTabId = (search: string): number | null => {
  const raw = new URLSearchParams(search).get('tabId')
  if (!raw) return null

  const tabId = Number.parseInt(raw, 10)
  return Number.isNaN(tabId) ? null : tabId
}
