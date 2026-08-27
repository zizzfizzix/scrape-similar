import {
  buildSuggestionIds,
  filterPresetsByQuery,
  filterRecentSelectors,
  isSelectorAPreset,
  nextSuggestionIndex,
  RECENT_SUGGESTION_PREFIX,
  resolveSuggestion,
} from '@/utils/autosuggest'
import type { Preset, ScrapeConfig } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const preset = (id: string, name: string, mainSelector: string): Preset => ({
  id,
  name,
  config: { mainSelector, columns: [] },
  createdAt: 1_700_000_000_000,
})

const links = preset('p1', 'All links', '//a')
const rows = preset('p2', 'Table rows', '//table//tr')
const images = preset('p3', 'Images', '//img')
const allPresets = [links, rows, images]

describe('filterPresetsByQuery', () => {
  it('returns everything for an empty query', () => {
    expect(filterPresetsByQuery(allPresets, '')).toEqual(allPresets)
  })

  it('returns everything for a whitespace-only query', () => {
    expect(filterPresetsByQuery(allPresets, '   ')).toEqual(allPresets)
  })

  it('matches on the preset name', () => {
    expect(filterPresetsByQuery(allPresets, 'table')).toEqual([rows])
  })

  it('matches on the selector', () => {
    expect(filterPresetsByQuery(allPresets, '//img')).toEqual([images])
  })

  it('ignores case on both sides', () => {
    expect(filterPresetsByQuery(allPresets, 'ALL LINKS')).toEqual([links])
  })

  it('trims the query before matching', () => {
    expect(filterPresetsByQuery(allPresets, '  images  ')).toEqual([images])
  })

  it('returns several matches when the query is broad', () => {
    expect(filterPresetsByQuery(allPresets, '//')).toEqual(allPresets)
  })

  it('returns nothing when nothing matches', () => {
    expect(filterPresetsByQuery(allPresets, 'zzz')).toEqual([])
  })

  it('tolerates a preset with no selector', () => {
    const empty = preset('p4', 'Empty', '')

    expect(filterPresetsByQuery([empty], 'empty')).toEqual([empty])
    expect(filterPresetsByQuery([empty], '//a')).toEqual([])
  })
})

describe('filterRecentSelectors', () => {
  const recents = ['//li', '//a', '//span']

  it('returns the recents that no preset already covers', () => {
    expect(filterRecentSelectors(recents, allPresets, '')).toEqual(['//li', '//span'])
  })

  it('keeps every recent when there are no presets', () => {
    expect(filterRecentSelectors(recents, [], '')).toEqual(recents)
  })

  it('narrows to the ones matching the query', () => {
    expect(filterRecentSelectors(recents, [], 'li')).toEqual(['//li'])
  })

  it('ignores case in the query', () => {
    expect(filterRecentSelectors(['//DIV'], [], 'div')).toEqual(['//DIV'])
  })

  it('trims the query', () => {
    expect(filterRecentSelectors(recents, [], '  span  ')).toEqual(['//span'])
  })

  it('ignores presets with a blank selector when de-duplicating', () => {
    expect(filterRecentSelectors(['//li'], [preset('p', 'Blank', '   ')], '')).toEqual(['//li'])
  })

  it('compares against the preset selector with surrounding space trimmed', () => {
    expect(filterRecentSelectors(['//li'], [preset('p', 'Padded', '  //li  ')], '')).toEqual([])
  })

  it('returns nothing when there are no recents', () => {
    expect(filterRecentSelectors([], allPresets, '')).toEqual([])
  })
})

describe('buildSuggestionIds', () => {
  it('lists recents before presets', () => {
    expect(buildSuggestionIds(['//li', '//span'], [links, rows])).toEqual([
      'recent-0',
      'recent-1',
      'p1',
      'p2',
    ])
  })

  it('prefixes recents so their ids cannot collide with preset ids', () => {
    expect(buildSuggestionIds(['//li'], [])[0]).toBe(`${RECENT_SUGGESTION_PREFIX}0`)
  })

  it('lists presets alone when there are no recents', () => {
    expect(buildSuggestionIds([], [links])).toEqual(['p1'])
  })

  it('returns nothing when there is nothing to suggest', () => {
    expect(buildSuggestionIds([], [])).toEqual([])
  })
})

describe('nextSuggestionIndex', () => {
  it('moves down one', () => {
    expect(nextSuggestionIndex(0, 3, 1)).toBe(1)
  })

  it('wraps from the last entry back to the first', () => {
    expect(nextSuggestionIndex(2, 3, 1)).toBe(0)
  })

  it('moves up one', () => {
    expect(nextSuggestionIndex(2, 3, -1)).toBe(1)
  })

  it('wraps from the first entry to the last', () => {
    expect(nextSuggestionIndex(0, 3, -1)).toBe(2)
  })

  it('selects the first entry when nothing is highlighted yet and moving down', () => {
    expect(nextSuggestionIndex(-1, 3, 1)).toBe(0)
  })

  it('selects the last entry when nothing is highlighted yet and moving up', () => {
    expect(nextSuggestionIndex(-1, 3, -1)).toBe(2)
  })

  it('reports nothing to highlight for an empty list', () => {
    expect(nextSuggestionIndex(0, 0, 1)).toBe(-1)
    expect(nextSuggestionIndex(0, 0, -1)).toBe(-1)
  })

  it('stays put in a single-entry list', () => {
    expect(nextSuggestionIndex(0, 1, 1)).toBe(0)
    expect(nextSuggestionIndex(0, 1, -1)).toBe(0)
  })
})

describe('resolveSuggestion', () => {
  const recents = ['//li', '//span']

  it('resolves a recent by its position', () => {
    expect(resolveSuggestion('recent-1', recents, allPresets)).toEqual({
      kind: 'recent',
      selector: '//span',
    })
  })

  it('resolves a preset by id', () => {
    expect(resolveSuggestion('p2', recents, allPresets)).toEqual({ kind: 'preset', preset: rows })
  })

  it('resolves nothing for a recent index that no longer exists', () => {
    expect(resolveSuggestion('recent-9', recents, allPresets)).toBeNull()
  })

  it('resolves nothing for an unparseable recent index', () => {
    expect(resolveSuggestion('recent-x', recents, allPresets)).toBeNull()
  })

  it('resolves nothing for an unknown preset id', () => {
    expect(resolveSuggestion('missing', recents, allPresets)).toBeNull()
  })

  it('resolves nothing when nothing is highlighted', () => {
    expect(resolveSuggestion(undefined, recents, allPresets)).toBeNull()
  })
})

describe('isSelectorAPreset', () => {
  it('recognises a selector a preset already stores', () => {
    expect(isSelectorAPreset('//a', allPresets)).toBe(true)
  })

  it('ignores surrounding whitespace on both sides', () => {
    expect(isSelectorAPreset('  //a  ', allPresets)).toBe(true)
    expect(isSelectorAPreset('//a', [preset('p', 'Padded', '  //a  ')])).toBe(true)
  })

  it('rejects a selector no preset stores', () => {
    expect(isSelectorAPreset('//li', allPresets)).toBe(false)
  })

  it('rejects a blank selector against presets that all have one', () => {
    expect(isSelectorAPreset('', allPresets)).toBe(false)
  })

  it('reports false when there are no presets', () => {
    expect(isSelectorAPreset('//a', [])).toBe(false)
  })

  it('tolerates a preset with no selector', () => {
    const withoutSelector = { ...links, config: {} as ScrapeConfig }

    expect(isSelectorAPreset('//a', [withoutSelector])).toBe(false)
  })
})
