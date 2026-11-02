import {
  applyColumnEdit,
  DEFAULT_COLUMN_SELECTOR,
  DEFAULT_SCRAPE_CONFIG,
  isColumnEdit,
  resolveStoredConfig,
  sanitizeToSingleLine,
  withTrimmedMainSelector,
} from '@/utils/scrape-config'
import type { ColumnDefinition, ScrapeConfig } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const config = (): ScrapeConfig => ({
  mainSelector: '//tr',
  columns: [
    { name: 'Rank', selector: './td[1]' },
    { name: 'Country', selector: './td[2]' },
  ],
})

describe('applyColumnEdit', () => {
  const columns = () => config().columns
  const [rank, country] = config().columns as [ColumnDefinition, ColumnDefinition]

  it('replaces the column at the index when it is the one the edit expects', () => {
    const column = { name: 'Territory', selector: './td[2]' }

    expect(
      applyColumnEdit(columns(), { type: 'update', index: 1, expected: country, column }),
    ).toEqual([rank, column])
  })

  it('refuses an update whose column has since changed', () => {
    const edit = {
      type: 'update',
      index: 0,
      expected: { name: 'Text', selector: '.' },
      column: { name: 'Label', selector: '.' },
    } as const

    expect(applyColumnEdit(columns(), edit)).toBeNull()
  })

  it('compares the key as well as the name and selector', () => {
    const keyed = [{ ...rank, key: 'rank' }]

    const update = (expected: ColumnDefinition) =>
      applyColumnEdit(keyed, { type: 'update', index: 0, expected, column: country })

    expect(update(rank)).toBeNull()
    expect(update(keyed[0]!)).toEqual([country])
  })

  it('refuses an edit whose index is past the end', () => {
    expect(applyColumnEdit(columns(), { type: 'remove', index: 2, expected: rank })).toBeNull()
  })

  it('refuses to remove the only column', () => {
    expect(applyColumnEdit([rank], { type: 'remove', index: 0, expected: rank })).toBeNull()
  })

  it('drops the column at the index when it is the one the edit expects', () => {
    expect(applyColumnEdit(columns(), { type: 'remove', index: 0, expected: rank })).toEqual([
      country,
    ])
  })

  it('refuses a removal whose column has since moved', () => {
    expect(applyColumnEdit(columns(), { type: 'remove', index: 0, expected: country })).toBeNull()
  })

  it('appends a column numbered after the list it lands on', () => {
    const added = (name: string) => ({ name, selector: DEFAULT_COLUMN_SELECTOR })

    expect(applyColumnEdit(columns(), { type: 'add' })).toEqual([rank, country, added('Column 3')])
    expect(applyColumnEdit([], { type: 'add' })).toEqual([added('Column 1')])
  })

  it('does not mutate the list it was given', () => {
    const original = columns()

    applyColumnEdit(original, { type: 'remove', index: 0, expected: rank })
    applyColumnEdit(original, { type: 'add' })
    applyColumnEdit(original, { type: 'update', index: 0, expected: rank, column: country })

    expect(original).toEqual([rank, country])
  })
})

describe('isColumnEdit', () => {
  const column = { name: 'Rank', selector: './td[1]' }

  it.each([
    ['an add', { type: 'add' }],
    ['a removal', { type: 'remove', index: 0, expected: column }],
    ['an update', { type: 'update', index: 1, expected: column, column }],
    [
      'an update of a keyed column',
      { type: 'update', index: 0, expected: { ...column, key: 'r' }, column },
    ],
  ])('accepts %s', (_, value) => {
    expect(isColumnEdit(value)).toBe(true)
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'add'],
    ['an unknown type', { type: 'rename', index: 0, expected: column, column }],
    ['a fractional index', { type: 'remove', index: 0.5, expected: column }],
    ['a missing expected column', { type: 'remove', index: 0 }],
    ['an expected column that is not an object', { type: 'remove', index: 0, expected: 'Rank' }],
    [
      'an expected column with no selector',
      { type: 'remove', index: 0, expected: { name: 'Rank' } },
    ],
    ['a key that is not a string', { type: 'remove', index: 0, expected: { ...column, key: 1 } }],
    ['an update with no column', { type: 'update', index: 0, expected: column }],
  ])('refuses %s', (_, value) => {
    expect(isColumnEdit(value)).toBe(false)
  })
})

describe('sanitizeToSingleLine', () => {
  it('leaves a single-line value alone', () => {
    expect(sanitizeToSingleLine('//table//tr')).toBe('//table//tr')
  })

  it('replaces a newline with a space', () => {
    expect(sanitizeToSingleLine('//table\n//tr')).toBe('//table //tr')
  })

  it('collapses a run of line breaks into one space', () => {
    expect(sanitizeToSingleLine('//table\r\n\r\n//tr')).toBe('//table //tr')
  })

  it('handles carriage returns on their own', () => {
    expect(sanitizeToSingleLine('a\rb')).toBe('a b')
  })

  it('leaves other whitespace untouched', () => {
    expect(sanitizeToSingleLine('  //a  ')).toBe('  //a  ')
  })

  it('handles an empty value', () => {
    expect(sanitizeToSingleLine('')).toBe('')
  })
})

describe('withTrimmedMainSelector', () => {
  it('trims whitespace around the main selector', () => {
    expect(withTrimmedMainSelector({ ...config(), mainSelector: '  //tr \t' })).toEqual(config())
  })

  it('returns a config whose selector is already trimmed unchanged', () => {
    const trimmed = config()

    expect(withTrimmedMainSelector(trimmed)).toBe(trimmed)
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

  it('trims the stored selector', () => {
    const config = resolveStoredConfig({
      currentScrapeConfig: { ...storedConfig, mainSelector: ' //tr ' },
    })

    expect(config).toEqual(storedConfig)
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
      elementDetails: { xpath: '' },
    })

    expect(config).toEqual(DEFAULT_SCRAPE_CONFIG)
  })
})
