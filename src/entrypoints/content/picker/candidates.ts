import { evaluateXPath, minimizeXPath } from '@/utils/scraper'

/**
 * Generate selector candidates by walking up the DOM tree from a starting element
 */
export const generateSelectorCandidates = (
  start: HTMLElement,
  maxLevels: number = 10,
): string[] => {
  // A Set keeps insertion order while collapsing ancestors that minimize to the
  // same expression.
  const candidates = new Set<string>()
  let node: HTMLElement | null = start
  let levels = 0
  while (node && node !== document.body && levels <= maxLevels) {
    candidates.add(minimizeXPath(node))
    node = node.parentElement as HTMLElement | null
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
