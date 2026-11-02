import { buildTableRowSelector } from '@/utils/scrape-guess'
import { evaluateXPath, minimizeXPath } from '@/utils/scraper'

// A row's own path also matches the header row, which then scrapes as data;
// the table-row selector keeps the same rows the context-menu guess picks.
const candidateFor = (node: HTMLElement): string =>
  (node.tagName.toLowerCase() === 'tr' ? buildTableRowSelector(node) : null) ?? minimizeXPath(node)

/**
 * Generate selector candidates by walking up the DOM tree from a starting element
 */
export const generateSelectorCandidates = (start: HTMLElement, maxLevels = 10): string[] => {
  // A Set keeps insertion order while collapsing ancestors that minimize to the
  // same expression.
  const candidates = new Set<string>()
  let node: HTMLElement | null = start
  let levels = 0
  // Neither <body> nor <html> describes a repeated element, and a click that
  // resolves to them selects nothing.
  while (
    node &&
    node !== document.body &&
    node !== document.documentElement &&
    levels <= maxLevels
  ) {
    candidates.add(candidateFor(node))
    node = node.parentElement
    levels += 1
  }
  return [...candidates]
}

/**
 * Choose the default candidate index (first one with at least 2 matches)
 */
export const chooseDefaultCandidateIndex = (candidates: string[]): number => {
  for (const [i, candidate] of candidates.entries()) {
    const count = evaluateXPath(candidate).length
    if (count >= 2) return i
  }
  return 0
}
