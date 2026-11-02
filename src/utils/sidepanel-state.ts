import type { ScrapeConfig, SidePanelConfigUpdate } from '@/utils/types'
import slugify from 'slugify'

/**
 * Build the session-storage updates to persist when the user commits a main
 * selector, or `null` when it did not change.
 *
 * Only the selector is sent. Another context (Guess, the picker, a
 * context-menu selection) can write this tab's columns before the panel has
 * applied them, and the panel's older copy must not overwrite that write.
 * Column edits travel as a `ColumnEdit` instead.
 *
 * A stored highlight result only describes the main selector it was produced
 * for, so changing (or clearing) that selector invalidates it. It has to be
 * reset in storage as well as in local state - otherwise the side panel's
 * storage watcher restores the stale match count right after the change.
 */
export const buildMainSelectorUpdates = (
  previousSelector: string,
  nextSelector: string,
): SidePanelConfigUpdate | null =>
  nextSelector === previousSelector
    ? null
    : {
        currentScrapeConfig: { mainSelector: nextSelector },
        highlightMatchCount: null,
        highlightError: null,
      }

/**
 * Build the session-storage updates that replace the whole scrape config, as
 * loading a preset does. Both fields are sent even where they equal the
 * panel's copy, since the stored config may hold another context's newer
 * values, and the stored highlight result is reset for the same reason.
 */
export const buildConfigReplaceUpdates = (config: ScrapeConfig): SidePanelConfigUpdate => ({
  currentScrapeConfig: { mainSelector: config.mainSelector, columns: config.columns },
  highlightMatchCount: null,
  highlightError: null,
})

interface MainSelectorValidationState {
  mainSelector: string
  hasUncommittedChanges: boolean
  highlightMatchCount?: number
  highlightError?: string
}

/**
 * Whether the committed main selector has a usable highlight result, i.e.
 * whether the match-count badge should be shown and scraping allowed.
 * `mainSelector` is trimmed, so a blank one is empty.
 */
export const isMainSelectorValidated = ({
  mainSelector,
  hasUncommittedChanges,
  highlightMatchCount,
  highlightError,
}: MainSelectorValidationState): boolean =>
  !!mainSelector &&
  !hasUncommittedChanges &&
  typeof highlightMatchCount === 'number' &&
  !highlightError

/**
 * Filename for an export from this tab.
 *
 * Slugified so it is safe on every platform, and stamped with the time so
 * repeated exports from one page do not overwrite each other.
 */
export const buildExportFilename = (tabUrl: string | null, now: Date): string => {
  const dateTime = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const slug = slugify(tabUrl || 'unknown-url', { lower: true, strict: true })
  return `Data export for ${slug} at ${dateTime}`
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
