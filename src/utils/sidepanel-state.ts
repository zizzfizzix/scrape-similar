import type { ScrapeConfig, SelectionOptions, SidePanelConfig } from '@/utils/types'
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

/** The blank session state a tab starts from. */
export const createDefaultSidePanelState = (): Partial<SidePanelConfig> => ({
  initialSelectionText: undefined,
  elementDetails: undefined,
  selectionOptions: undefined,
  currentScrapeConfig: undefined,
  scrapeResult: undefined,
})

/**
 * The config and selection to show for a stored session state.
 *
 * A stored config wins. Failing that, a right-click that recorded an element
 * seeds the main selector from it. Otherwise the panel starts blank.
 */
export const resolveStoredConfig = (
  state: SidePanelConfig,
): { config: ScrapeConfig; options: SelectionOptions | null } => {
  const { currentScrapeConfig, elementDetails, selectionOptions, initialSelectionText } = state

  const config = currentScrapeConfig
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

  const options: SelectionOptions | null =
    selectionOptions ??
    (elementDetails
      ? { xpath: elementDetails.xpath, selectedText: initialSelectionText || elementDetails.text }
      : null)

  return { config, options }
}

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
