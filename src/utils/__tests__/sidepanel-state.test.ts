import { buildConfigChangeUpdates, isMainSelectorValidated } from '@/utils/sidepanel-state'
import type { ScrapeConfig } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const makeConfig = (mainSelector: string): ScrapeConfig => ({
  mainSelector,
  columns: [{ name: 'Text', selector: '.' }],
})

describe('buildConfigChangeUpdates', () => {
  it('persists the new config without touching highlight state when the main selector is unchanged', () => {
    const previous = makeConfig('//span')
    const next: ScrapeConfig = { ...previous, columns: [{ name: 'Href', selector: '@href' }] }

    const updates = buildConfigChangeUpdates(previous, next)

    expect(updates.currentScrapeConfig).toEqual(next)
    expect(updates).not.toHaveProperty('highlightMatchCount')
    expect(updates).not.toHaveProperty('highlightError')
  })

  it('resets stored highlight state when the main selector is cleared', () => {
    const updates = buildConfigChangeUpdates(makeConfig('//span'), makeConfig(''))

    expect(updates.currentScrapeConfig).toEqual(makeConfig(''))
    expect(updates.highlightMatchCount).toBeNull()
    expect(updates.highlightError).toBeNull()
  })

  it('resets stored highlight state when the main selector is replaced', () => {
    const updates = buildConfigChangeUpdates(makeConfig('//span'), makeConfig('//a'))

    expect(updates.highlightMatchCount).toBeNull()
    expect(updates.highlightError).toBeNull()
  })
})

describe('isMainSelectorValidated', () => {
  it('is true for a committed, successfully highlighted selector', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '//span',
        hasUncommittedChanges: false,
        highlightMatchCount: 42,
        highlightError: undefined,
      }),
    ).toBe(true)
  })

  it('is true when a committed selector matched nothing', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '//span',
        hasUncommittedChanges: false,
        highlightMatchCount: 0,
        highlightError: undefined,
      }),
    ).toBe(true)
  })

  it('is false for an empty selector even if a stale match count is present', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '   ',
        hasUncommittedChanges: false,
        highlightMatchCount: 42,
        highlightError: undefined,
      }),
    ).toBe(false)
  })

  it('is false while the selector has uncommitted changes', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '//a',
        hasUncommittedChanges: true,
        highlightMatchCount: 42,
        highlightError: undefined,
      }),
    ).toBe(false)
  })

  it('is false when the selector could not be evaluated', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '//a[',
        hasUncommittedChanges: false,
        highlightMatchCount: undefined,
        highlightError: 'Invalid XPath',
      }),
    ).toBe(false)
  })

  it('is false when no highlight has been performed yet', () => {
    expect(
      isMainSelectorValidated({
        mainSelector: '//a',
        hasUncommittedChanges: false,
        highlightMatchCount: undefined,
        highlightError: undefined,
      }),
    ).toBe(false)
  })
})
