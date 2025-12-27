import { evaluateXPath, minimizeXPath } from '@/utils/scraper'

/**
 * Generate selector candidates by walking up the DOM tree from a starting element
 */
export const generateSelectorCandidates = (
  start: HTMLElement,
  maxLevels: number = 10,
): string[] => {
  const candidates: string[] = []
  let node: HTMLElement | null = start
  let levels = 0
  while (node && node !== document.body && levels <= maxLevels) {
    const xp = minimizeXPath(node)
    if (!candidates.includes(xp)) candidates.push(xp)
    node = node.parentElement as HTMLElement | null
    levels += 1
  }
  return candidates
}

/**
 * Choose the default candidate index (first one with at least 2 matches)
 */
export const chooseDefaultCandidateIndex = (candidates: string[]): number => {
  for (let i = 0; i < candidates.length; i++) {
    const count = evaluateXPath(candidates[i]).length
    if (count >= 2) return i
  }
  return 0
}
