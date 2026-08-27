import type { ScrapeConfig, SidePanelConfig } from '@/utils/types'

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
