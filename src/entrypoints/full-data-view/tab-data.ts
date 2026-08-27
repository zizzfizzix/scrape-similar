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

/** True when the stored state holds at least one scraped row. */
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

/** Rows to display, honouring the "show empty rows" toggle. */
export const visibleRows = (rows: ScrapedRow[], showEmptyRows: boolean): ScrapedRow[] =>
  showEmptyRows ? rows : rows.filter((row) => !row.metadata.isEmpty)

/** Fixed widths for the columns the table adds itself. */
const FIXED_COLUMN_WIDTHS: Record<string, number> = {
  select: 35,
  rowIndex: 35,
  actions: 75,
}

/** Width used for a column the config does not describe. */
const UNKNOWN_COLUMN_WIDTH = 200

/** Rows sampled when sizing a column; enough to be representative, few enough to be quick. */
const WIDTH_SAMPLE_SIZE = 100

const CHAR_WIDTH_PX = 8
const CELL_PADDING_PX = 24
const MIN_COLUMN_WIDTH = 100
const MAX_COLUMN_WIDTH = 400

/**
 * Width to give a column, from the longest value in the first rows.
 *
 * An approximation: character count times an average glyph width, clamped so a
 * column is never unusably narrow nor wide enough to push the rest off-screen.
 */
export const calculateOptimalColumnWidth = (
  columnId: string,
  rows: ScrapedRow[],
  config: ScrapeConfig,
): number => {
  const fixed = FIXED_COLUMN_WIDTHS[columnId]
  if (fixed !== undefined) return fixed

  const columnIndex = config.columns.findIndex((column) => column.name === columnId)
  if (columnIndex === -1) return UNKNOWN_COLUMN_WIDTH

  const dataKey = config.columns[columnIndex]?.key || columnId
  const longest = rows.slice(0, WIDTH_SAMPLE_SIZE).reduce(
    (max, row) => Math.max(max, String(row.data[dataKey] || '').length),
    columnId.length, // The header has to fit too.
  )

  return Math.min(
    Math.max(longest * CHAR_WIDTH_PX + CELL_PADDING_PX, MIN_COLUMN_WIDTH),
    MAX_COLUMN_WIDTH,
  )
}

/** The tab id the view was opened for, or null when the URL names none. */
export const parseRequestedTabId = (search: string): number | null => {
  const raw = new URLSearchParams(search).get('tabId')
  if (!raw) return null

  const tabId = Number.parseInt(raw, 10)
  return Number.isNaN(tabId) ? null : tabId
}
