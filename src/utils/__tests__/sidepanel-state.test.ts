import {
  buildConfigChangeUpdates,
  buildConfigReplaceUpdates,
  buildExportFilename,
  DEFAULT_SCRAPE_CONFIG,
  hasConfigDrifted,
  isMainSelectorValidated,
  parseFullDataViewTabId,
  resolveStoredConfig,
  reuseIfEqual,
} from '@/utils/sidepanel-state'
import type { ScrapeConfig } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const makeConfig = (mainSelector: string): ScrapeConfig => ({
  mainSelector,
  columns: [{ name: 'Text', selector: '.' }],
})

describe('buildConfigChangeUpdates', () => {
  it('sends only the columns, without touching highlight state, when the main selector is unchanged', () => {
    const previous = makeConfig('//span')
    const columns = [{ name: 'Href', selector: '@href' }]

    const updates = buildConfigChangeUpdates(previous, { ...previous, columns })

    expect(updates).toEqual({ currentScrapeConfig: { columns } })
  })

  it('sends only the main selector, resetting stored highlight state, when it is cleared', () => {
    const updates = buildConfigChangeUpdates(makeConfig('//span'), makeConfig(''))

    expect(updates).toEqual({
      currentScrapeConfig: { mainSelector: '' },
      highlightMatchCount: null,
      highlightError: null,
    })
  })

  it('resets stored highlight state when the main selector is replaced', () => {
    const updates = buildConfigChangeUpdates(makeConfig('//span'), makeConfig('//a'))

    expect(updates).toMatchObject({ highlightMatchCount: null, highlightError: null })
  })

  it('returns null when nothing changed', () => {
    const previous = makeConfig('//span')

    expect(buildConfigChangeUpdates(previous, makeConfig('//span'))).toBeNull()
  })

  it('treats equal columns in a new array as unchanged', () => {
    const previous = makeConfig('//span')
    const next = { mainSelector: '//a', columns: previous.columns.map((column) => ({ ...column })) }

    expect(buildConfigChangeUpdates(previous, next)).toEqual({
      currentScrapeConfig: { mainSelector: '//a' },
      highlightMatchCount: null,
      highlightError: null,
    })
  })

  it('sends both fields when both changed', () => {
    const columns = [{ name: 'Href', selector: '@href' }]

    const updates = buildConfigChangeUpdates(makeConfig('//span'), { mainSelector: '//a', columns })

    expect(updates).toMatchObject({ currentScrapeConfig: { mainSelector: '//a', columns } })
  })
})

describe('buildConfigReplaceUpdates', () => {
  it('sends every field and resets stored highlight state', () => {
    const config = makeConfig('//span')

    expect(buildConfigReplaceUpdates(config)).toEqual({
      currentScrapeConfig: config,
      highlightMatchCount: null,
      highlightError: null,
    })
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

describe('buildExportFilename', () => {
  const at = new Date('2026-08-27T13:45:30.123Z')

  it('slugifies the page URL and stamps the time', () => {
    expect(buildExportFilename('https://en.wikipedia.org/wiki/Poland', at)).toBe(
      'Data export for httpsenwikipediaorgwikipoland at 2026-08-27_13-45-30-123',
    )
  })

  it('names an unknown page when there is no URL', () => {
    expect(buildExportFilename(null, at)).toContain('Data export for unknown-url at')
  })

  it('names an unknown page for an empty URL', () => {
    expect(buildExportFilename('', at)).toContain('Data export for unknown-url at')
  })

  it('strips characters that are unsafe in a filename', () => {
    const filename = buildExportFilename('https://example.com/a?b=c&d=e', at)

    expect(filename).not.toMatch(/[?&:]/)
  })

  it('gives two exports from the same page different names', () => {
    expect(buildExportFilename('https://example.com', at)).not.toBe(
      buildExportFilename('https://example.com', new Date('2026-08-27T13:45:31.000Z')),
    )
  })
})

describe('resolveStoredConfig', () => {
  const storedConfig: ScrapeConfig = {
    mainSelector: '//tr',
    columns: [{ name: 'Rank', selector: './td[1]' }],
  }

  it('starts blank when nothing is stored', () => {
    expect(resolveStoredConfig({})).toEqual(DEFAULT_SCRAPE_CONFIG)
  })

  it('uses the stored config as-is', () => {
    expect(resolveStoredConfig({ currentScrapeConfig: storedConfig })).toEqual(storedConfig)
  })

  it('keeps the default columns when the stored config has none', () => {
    const config = resolveStoredConfig({
      currentScrapeConfig: { mainSelector: '//tr', columns: [] },
    })

    expect(config).toEqual({ mainSelector: '//tr', columns: DEFAULT_SCRAPE_CONFIG.columns })
  })

  it('keeps the default columns when the stored config’s columns are not a list', () => {
    const config = resolveStoredConfig({
      currentScrapeConfig: { mainSelector: '//tr' } as ScrapeConfig,
    })

    expect(config.columns).toEqual(DEFAULT_SCRAPE_CONFIG.columns)
  })

  it('seeds the selector from a right-clicked element when nothing is stored', () => {
    const config = resolveStoredConfig({
      elementDetails: { xpath: '/html/body/ul/li', text: 'a' },
    })

    expect(config).toEqual({ ...DEFAULT_SCRAPE_CONFIG, mainSelector: '/html/body/ul/li' })
  })

  it('prefers a stored config over a right-clicked element', () => {
    const config = resolveStoredConfig({
      currentScrapeConfig: storedConfig,
      elementDetails: { xpath: '/html/body/ul/li', text: 'a' },
    })

    expect(config.mainSelector).toBe('//tr')
  })

  it('ignores element details with no xpath', () => {
    const config = resolveStoredConfig({
      elementDetails: { xpath: '' } as { xpath: string },
    })

    expect(config).toEqual(DEFAULT_SCRAPE_CONFIG)
  })
})

describe('parseFullDataViewTabId', () => {
  it('reads the originating tab from the view URL', () => {
    expect(parseFullDataViewTabId('chrome-extension://abc/full-data-view.html?tabId=42')).toBe(42)
  })

  it('reports none when the URL names no tab', () => {
    expect(parseFullDataViewTabId('chrome-extension://abc/full-data-view.html')).toBeNull()
  })

  it('reports none when the parameter is empty', () => {
    expect(parseFullDataViewTabId('https://example.com/?tabId=')).toBeNull()
  })

  it('reports none when the parameter is not a number', () => {
    expect(parseFullDataViewTabId('https://example.com/?tabId=abc')).toBeNull()
  })

  it('reports none for a URL that will not parse', () => {
    expect(parseFullDataViewTabId('not a url')).toBeNull()
  })
})

describe('hasConfigDrifted', () => {
  const producing: ScrapeConfig = {
    mainSelector: '//tr',
    columns: [
      { name: 'Rank', selector: './td[1]' },
      { name: 'Country', selector: './td[2]' },
    ],
  }

  it('reports no drift for an identical config', () => {
    expect(hasConfigDrifted({ ...producing }, producing)).toBe(false)
  })

  it('reports drift when the main selector changed', () => {
    expect(hasConfigDrifted({ ...producing, mainSelector: '//li' }, producing)).toBe(true)
  })

  it('reports drift when a column was added', () => {
    const current = {
      ...producing,
      columns: [...producing.columns, { name: 'Extra', selector: '.' }],
    }

    expect(hasConfigDrifted(current, producing)).toBe(true)
  })

  it('reports drift when a column was removed', () => {
    expect(hasConfigDrifted({ ...producing, columns: [producing.columns[0]!] }, producing)).toBe(
      true,
    )
  })

  it('reports drift when a column was renamed', () => {
    const current = {
      ...producing,
      columns: [{ name: 'Position', selector: './td[1]' }, producing.columns[1]!],
    }

    expect(hasConfigDrifted(current, producing)).toBe(true)
  })

  it('reports drift when a column was repointed', () => {
    const current = {
      ...producing,
      columns: [{ name: 'Rank', selector: '@data-rank' }, producing.columns[1]!],
    }

    expect(hasConfigDrifted(current, producing)).toBe(true)
  })

  it('reports drift when a column gained an internal key', () => {
    const current = {
      ...producing,
      columns: [{ name: 'Rank', selector: './td[1]', key: 'col1' }, producing.columns[1]!],
    }

    expect(hasConfigDrifted(current, producing)).toBe(true)
  })

  it('reports no drift when a key merely restates the name', () => {
    const current = {
      ...producing,
      columns: [{ name: 'Rank', selector: './td[1]', key: 'Rank' }, producing.columns[1]!],
    }

    expect(hasConfigDrifted(current, producing)).toBe(false)
  })

  it('reports no drift between two empty column lists', () => {
    const empty: ScrapeConfig = { mainSelector: '//tr', columns: [] }

    expect(hasConfigDrifted(empty, empty)).toBe(false)
  })
})

describe('reuseIfEqual', () => {
  it('keeps the previous reference for equal data', () => {
    const previous = { data: [{ a: '1' }] }

    expect(reuseIfEqual(previous, { data: [{ a: '1' }] })).toBe(previous)
  })

  it('takes the next value when the data differs', () => {
    const next = { data: [{ a: '2' }] }

    expect(reuseIfEqual({ data: [{ a: '1' }] }, next)).toBe(next)
  })

  it('treats a key holding undefined as absent, as storage does', () => {
    const previous: { data: { a: string; b?: string }[] } = { data: [{ a: '1', b: undefined }] }

    expect(reuseIfEqual(previous, { data: [{ a: '1' }] })).toBe(previous)
  })

  it('takes the next value when a key is added', () => {
    const next = { a: '1', b: '2' }

    expect(reuseIfEqual<Record<string, string>>({ a: '1' }, next)).toBe(next)
  })

  it('tells an empty array from an empty object', () => {
    const next = {}

    expect(reuseIfEqual<unknown>([], next)).toBe(next)
  })

  it('tells arrays of different lengths apart even when the extra entry is undefined', () => {
    const next = ['a']

    expect(reuseIfEqual<(string | undefined)[]>(['a', undefined], next)).toBe(next)
  })

  it('tells null from an object', () => {
    const next = { a: '1' }

    expect(reuseIfEqual<object | null>(null, next)).toBe(next)
  })
})
