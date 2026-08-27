import {
  calculateOptimalColumnWidth,
  collectTabsWithData,
  hasScrapedRows,
  parseRequestedTabId,
  resolveTabConfig,
  resolveTabSelection,
  visibleRows,
  type TabData,
} from '@/entrypoints/full-data-view/tab-data'
import type { ScrapeConfig, ScrapedRow, ScrapeResult, SidePanelConfig } from '@/utils/types'
import log from 'loglevel'
import { describe, expect, it, vi } from 'vitest'

const row = (data: Record<string, string>, isEmpty = false, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty },
})

const scrapeResult = (rows: ScrapedRow[]): ScrapeResult => ({
  data: rows,
  columnOrder: ['Title'],
})

const producingConfig: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Title', selector: '.', key: 'col1' }],
}

const editableConfig: ScrapeConfig = {
  mainSelector: '//li',
  columns: [{ name: 'Other', selector: '.' }],
}

const tab = (id: number, overrides: Partial<Browser.tabs.Tab> = {}) =>
  ({ id, url: `https://example.com/${id}`, title: `Tab ${id}`, ...overrides }) as Browser.tabs.Tab

const tabData = (tabId: number): TabData => ({
  tabId,
  tabUrl: `https://example.com/${tabId}`,
  tabTitle: `Tab ${tabId}`,
  scrapeResult: scrapeResult([row({ Title: 'a' })]),
  config: producingConfig,
})

describe('resolveTabConfig', () => {
  it('prefers the config that produced the stored rows', () => {
    expect(
      resolveTabConfig({
        resultProducingConfig: producingConfig,
        currentScrapeConfig: editableConfig,
      }),
    ).toBe(producingConfig)
  })

  it('falls back to the editable config', () => {
    expect(resolveTabConfig({ currentScrapeConfig: editableConfig })).toBe(editableConfig)
  })

  it('falls back to a single text column when neither is recorded', () => {
    expect(resolveTabConfig({})).toEqual({
      mainSelector: '',
      columns: [{ name: 'Text', selector: '.' }],
    })
  })
})

describe('hasScrapedRows', () => {
  it('accepts a state holding rows', () => {
    expect(hasScrapedRows({ scrapeResult: scrapeResult([row({ Title: 'a' })]) })).toBe(true)
  })

  it('rejects a state with an empty result', () => {
    expect(hasScrapedRows({ scrapeResult: scrapeResult([]) })).toBe(false)
  })

  it('rejects a state with no result', () => {
    expect(hasScrapedRows({})).toBe(false)
  })

  it('rejects a missing state', () => {
    expect(hasScrapedRows(null)).toBe(false)
  })

  it('rejects a result with no data field', () => {
    expect(hasScrapedRows({ scrapeResult: {} as ScrapeResult })).toBe(false)
  })
})

describe('collectTabsWithData', () => {
  const stateWithRows = (): SidePanelConfig => ({
    scrapeResult: scrapeResult([row({ Title: 'a' })]),
    resultProducingConfig: producingConfig,
  })

  it('returns one entry per tab that has rows', async () => {
    const collected = await collectTabsWithData([tab(1), tab(2)], async () => stateWithRows())

    expect(collected.map((entry) => entry.tabId)).toEqual([1, 2])
  })

  it('records the tab title, url and config alongside the rows', async () => {
    const [entry] = await collectTabsWithData([tab(7)], async () => stateWithRows())

    expect(entry).toEqual({
      tabId: 7,
      tabUrl: 'https://example.com/7',
      tabTitle: 'Tab 7',
      scrapeResult: scrapeResult([row({ Title: 'a' })]),
      config: producingConfig,
    })
  })

  it('skips tabs with no stored rows', async () => {
    const collected = await collectTabsWithData([tab(1), tab(2)], async (tabId) =>
      tabId === 1 ? stateWithRows() : null,
    )

    expect(collected.map((entry) => entry.tabId)).toEqual([1])
  })

  it('skips tabs with no id', async () => {
    const collected = await collectTabsWithData(
      [{ url: 'https://example.com' } as Browser.tabs.Tab],
      async () => stateWithRows(),
    )

    expect(collected).toEqual([])
  })

  it('describes a tab that reports no url or title', async () => {
    const [entry] = await collectTabsWithData([{ id: 3 } as Browser.tabs.Tab], async () =>
      stateWithRows(),
    )

    expect(entry?.tabUrl).toBe('Unknown URL')
    expect(entry?.tabTitle).toBe('Unknown Title')
  })

  it('skips a tab whose state cannot be read, keeping the rest', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('session gone')

    const collected = await collectTabsWithData([tab(1), tab(2)], async (tabId) => {
      if (tabId === 1) throw failure
      return stateWithRows()
    })

    expect(collected.map((entry) => entry.tabId)).toEqual([2])
    expect(warnSpy).toHaveBeenCalledWith('Error loading data for tab 1:', failure)
  })

  it('returns nothing when there are no tabs', async () => {
    expect(await collectTabsWithData([], async () => stateWithRows())).toEqual([])
  })
})

describe('resolveTabSelection', () => {
  it('shows the requested tab when it has data', () => {
    const tabs = [tabData(1), tabData(2)]

    expect(resolveTabSelection(tabs, 2)).toEqual({ tabId: 2, data: tabs[1] })
  })

  it('falls back to the first tab with data when the requested one has none', () => {
    const tabs = [tabData(1), tabData(2)]

    expect(resolveTabSelection(tabs, 99)).toEqual({ tabId: 1, data: tabs[0] })
  })

  it('shows the first tab with data when none was requested', () => {
    const tabs = [tabData(5)]

    expect(resolveTabSelection(tabs, null)).toEqual({ tabId: 5, data: tabs[0] })
  })

  it('shows nothing when no tab has data', () => {
    expect(resolveTabSelection([], 3)).toEqual({ tabId: null, data: null })
  })

  it('shows nothing when no tab has data and none was requested', () => {
    expect(resolveTabSelection([], null)).toEqual({ tabId: null, data: null })
  })
})

describe('visibleRows', () => {
  const filled = row({ Title: 'a' })
  const blank = row({ Title: '' }, true, 1)

  it('keeps every row when empty rows are shown', () => {
    expect(visibleRows([filled, blank], true)).toEqual([filled, blank])
  })

  it('drops the empty rows when they are hidden', () => {
    expect(visibleRows([filled, blank], false)).toEqual([filled])
  })

  it('copes with an empty list', () => {
    expect(visibleRows([], false)).toEqual([])
  })
})

describe('calculateOptimalColumnWidth', () => {
  const config: ScrapeConfig = {
    mainSelector: '//tr',
    columns: [
      { name: 'Title', selector: '.' },
      { name: 'Keyed', selector: '.', key: 'col2' },
    ],
  }

  it('gives the tick-box column a fixed narrow width', () => {
    expect(calculateOptimalColumnWidth('select', [], config)).toBe(35)
  })

  it('gives the row-number column a fixed narrow width', () => {
    expect(calculateOptimalColumnWidth('rowIndex', [], config)).toBe(35)
  })

  it('gives the actions column a fixed width', () => {
    expect(calculateOptimalColumnWidth('actions', [], config)).toBe(75)
  })

  it('falls back to a default for a column the config does not describe', () => {
    expect(calculateOptimalColumnWidth('Unknown', [], config)).toBe(200)
  })

  it('sizes to the longest value it finds', () => {
    const rows = [row({ Title: 'a'.repeat(30) })]

    expect(calculateOptimalColumnWidth('Title', rows, config)).toBe(30 * 8 + 24)
  })

  it('never sizes below the minimum, even for a short header', () => {
    expect(calculateOptimalColumnWidth('Title', [row({ Title: 'a' })], config)).toBe(100)
  })

  it('never sizes above the maximum', () => {
    const rows = [row({ Title: 'a'.repeat(500) })]

    expect(calculateOptimalColumnWidth('Title', rows, config)).toBe(400)
  })

  it('makes room for a header longer than every value', () => {
    const longHeader = 'H'.repeat(40)
    const wideConfig: ScrapeConfig = {
      mainSelector: '//tr',
      columns: [{ name: longHeader, selector: '.' }],
    }

    expect(calculateOptimalColumnWidth(longHeader, [row({ [longHeader]: 'a' })], wideConfig)).toBe(
      40 * 8 + 24,
    )
  })

  it('reads values by the column’s internal key when it has one', () => {
    const rows = [row({ col2: 'a'.repeat(30), Keyed: '' })]

    expect(calculateOptimalColumnWidth('Keyed', rows, config)).toBe(30 * 8 + 24)
  })

  it('samples only the first hundred rows', () => {
    const rows = [
      ...Array.from({ length: 100 }, () => row({ Title: 'short' })),
      row({ Title: 'a'.repeat(300) }),
    ]

    expect(calculateOptimalColumnWidth('Title', rows, config)).toBe(100)
  })

  it('treats a missing value as empty', () => {
    expect(calculateOptimalColumnWidth('Title', [row({})], config)).toBe(100)
  })
})

describe('parseRequestedTabId', () => {
  it('reads the tab id from the query string', () => {
    expect(parseRequestedTabId('?tabId=42')).toBe(42)
  })

  it('reads it from among other parameters', () => {
    expect(parseRequestedTabId('?foo=bar&tabId=7')).toBe(7)
  })

  it('reports none when the parameter is absent', () => {
    expect(parseRequestedTabId('?foo=bar')).toBeNull()
  })

  it('reports none for an empty query string', () => {
    expect(parseRequestedTabId('')).toBeNull()
  })

  it('reports none when the parameter is empty', () => {
    expect(parseRequestedTabId('?tabId=')).toBeNull()
  })

  it('reports none when the parameter is not a number', () => {
    expect(parseRequestedTabId('?tabId=abc')).toBeNull()
  })
})
