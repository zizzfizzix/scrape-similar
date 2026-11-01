import type { ScrapeConfig, SidePanelConfig } from '@/utils/types'
import slugify from 'slugify'

/**
 * Build the session-storage updates to persist when the scrape config changes.
 *
 * A stored highlight result only describes the main selector it was produced
 * for, so changing (or clearing) that selector invalidates it. It has to be
 * reset in storage as well as in local state - otherwise the side panel's
 * storage watcher restores the stale match count right after the change.
 */
export const buildConfigChangeUpdates = (
  previousConfig: ScrapeConfig,
  nextConfig: ScrapeConfig,
): Partial<SidePanelConfig> => {
  const updates: Partial<SidePanelConfig> = {
    currentScrapeConfig: nextConfig,
  }

  if (nextConfig.mainSelector !== previousConfig.mainSelector) {
    updates.highlightMatchCount = null
    updates.highlightError = null
  }

  return updates
}

interface MainSelectorValidationState {
  mainSelector: string
  hasUncommittedChanges: boolean
  highlightMatchCount?: number
  highlightError?: string
}

/**
 * Whether the committed main selector has a usable highlight result, i.e.
 * whether the match-count badge should be shown and scraping allowed.
 */
export const isMainSelectorValidated = ({
  mainSelector,
  hasUncommittedChanges,
  highlightMatchCount,
  highlightError,
}: MainSelectorValidationState): boolean =>
  !!mainSelector.trim() &&
  !hasUncommittedChanges &&
  typeof highlightMatchCount === 'number' &&
  !highlightError

/** Columns assumed before the user has configured any. */
export const DEFAULT_SCRAPE_CONFIG: ScrapeConfig = {
  mainSelector: '',
  columns: [{ name: 'Text', selector: '.' }],
}

/**
 * Filename for an export from this tab.
 *
 * Slugified so it is safe on every platform, and stamped with the time so
 * repeated exports from one page do not overwrite each other.
 */
export const buildExportFilename = (tabUrl: string | null, now: Date): string => {
  const dateTime = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0]
  const slug = slugify(tabUrl || 'unknown-url', { lower: true, strict: true })
  return `Data export for ${slug} at ${dateTime}`
}

/**
 * The config to show for a stored session state.
 *
 * A stored config wins. Failing that, a right-click that recorded an element
 * seeds the main selector from it. Otherwise the panel starts blank.
 */
export const resolveStoredConfig = ({
  currentScrapeConfig,
  elementDetails,
}: SidePanelConfig): ScrapeConfig =>
  currentScrapeConfig
    ? {
        ...DEFAULT_SCRAPE_CONFIG,
        ...currentScrapeConfig,
        // A stored config with no columns cannot produce anything, so keep the default.
        columns:
          Array.isArray(currentScrapeConfig.columns) && currentScrapeConfig.columns.length > 0
            ? currentScrapeConfig.columns
            : DEFAULT_SCRAPE_CONFIG.columns,
      }
    : elementDetails?.xpath
      ? { ...DEFAULT_SCRAPE_CONFIG, mainSelector: elementDetails.xpath }
      : DEFAULT_SCRAPE_CONFIG

/**
 * The tab a full-data-view URL was opened for, or null when it names none.
 *
 * Returns null rather than throwing for a URL that will not parse, so the
 * caller can report one "no target tab" message either way.
 */
export const parseFullDataViewTabId = (fullDataViewUrl: string): number | null => {
  let tabId: string | null
  try {
    tabId = new URL(fullDataViewUrl).searchParams.get('tabId')
  } catch {
    return null
  }
  if (!tabId) return null

  const parsed = Number(tabId)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Whether the current config no longer matches the one that produced the
 * results on screen, i.e. whether re-scraping would change what is shown.
 *
 * Compares the resolved key rather than just the name, since the key is what
 * the scraped rows are stored under.
 */
export const hasConfigDrifted = (current: ScrapeConfig, producing: ScrapeConfig): boolean => {
  if (current.mainSelector !== producing.mainSelector) return true
  if (current.columns.length !== producing.columns.length) return true

  return current.columns.some((column, index) => {
    // Safe: the column counts were just checked to match.
    const producingColumn = producing.columns[index]!

    return (
      column.name !== producingColumn.name ||
      column.selector !== producingColumn.selector ||
      (column.key || column.name) !== (producingColumn.key || producingColumn.name)
    )
  })
}

/**
 * `previous` when `next` holds the same data, otherwise `next`.
 *
 * Every storage read hands back a fresh object, and components that reset on a
 * new reference (the results table returns to page 1) would reset on a write
 * that changed nothing they show.
 */
export const reuseIfEqual = <T>(previous: T, next: T): T =>
  hasSameData(previous, next) ? previous : next

/** Keys holding a value; storage drops `undefined` properties, so they count as absent. */
const definedKeys = (value: object): string[] =>
  Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined)

/**
 * Structural equality over stored data, stopping at the first difference.
 * Avoids serialising both sides, which for a large scrape result costs
 * megabytes of strings on every storage write.
 */
const hasSameData = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  // Storage keeps an array's undefined entries (as null), so every index counts.
  if (Array.isArray(a)) {
    const other = b as unknown[]
    return a.length === other.length && a.every((item, index) => hasSameData(item, other[index]))
  }
  const keys = definedKeys(a)
  const record = b as Record<string, unknown>
  return (
    keys.length === definedKeys(b).length &&
    keys.every((key) => hasSameData((a as Record<string, unknown>)[key], record[key]))
  )
}
