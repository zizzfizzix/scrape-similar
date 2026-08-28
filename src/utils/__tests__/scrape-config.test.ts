import {
  DEFAULT_COLUMN_SELECTOR,
  sanitizeToSingleLine,
  withAddedColumn,
  withColumnName,
  withColumnSelector,
  withoutColumn,
} from '@/utils/scrape-config'
import type { ScrapeConfig } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const config = (): ScrapeConfig => ({
  mainSelector: '//tr',
  columns: [
    { name: 'Rank', selector: './td[1]' },
    { name: 'Country', selector: './td[2]' },
  ],
})

describe('withColumnName', () => {
  it('renames the column at the given index', () => {
    expect(withColumnName(config(), 1, 'Territory').columns).toEqual([
      { name: 'Rank', selector: './td[1]' },
      { name: 'Territory', selector: './td[2]' },
    ])
  })

  it('leaves the selector and the rest of the config alone', () => {
    const updated = withColumnName(config(), 0, 'Position')

    expect(updated.mainSelector).toBe('//tr')
    expect(updated.columns[0]?.selector).toBe('./td[1]')
  })

  it('does not mutate the config it was given', () => {
    const original = config()

    withColumnName(original, 0, 'Position')

    expect(original.columns[0]?.name).toBe('Rank')
  })

  it('accepts a blank name', () => {
    expect(withColumnName(config(), 0, '').columns[0]?.name).toBe('')
  })

  it('ignores an index past the end', () => {
    const original = config()

    expect(withColumnName(original, 9, 'Nope')).toBe(original)
  })

  it('ignores a negative index', () => {
    const original = config()

    expect(withColumnName(original, -1, 'Nope')).toBe(original)
  })
})

describe('withColumnSelector', () => {
  it('repoints the column at the given index', () => {
    expect(withColumnSelector(config(), 0, '@data-rank').columns[0]).toEqual({
      name: 'Rank',
      selector: '@data-rank',
    })
  })

  it('does not mutate the config it was given', () => {
    const original = config()

    withColumnSelector(original, 0, '@data-rank')

    expect(original.columns[0]?.selector).toBe('./td[1]')
  })

  it('ignores an index past the end', () => {
    const original = config()

    expect(withColumnSelector(original, 9, '.')).toBe(original)
  })
})

describe('withAddedColumn', () => {
  it('appends a column selecting the row’s own text', () => {
    expect(withAddedColumn(config(), 'Notes').columns.at(-1)).toEqual({
      name: 'Notes',
      selector: DEFAULT_COLUMN_SELECTOR,
    })
  })

  it('keeps the existing columns', () => {
    expect(withAddedColumn(config(), 'Notes').columns).toHaveLength(3)
  })

  it('adds to an empty column list', () => {
    const empty: ScrapeConfig = { mainSelector: '//tr', columns: [] }

    expect(withAddedColumn(empty, 'First').columns).toHaveLength(1)
  })

  it('ignores a blank name', () => {
    const original = config()

    expect(withAddedColumn(original, '   ')).toBe(original)
  })

  it('ignores an empty name', () => {
    const original = config()

    expect(withAddedColumn(original, '')).toBe(original)
  })

  it('keeps the name exactly as typed, padding included', () => {
    expect(withAddedColumn(config(), ' Notes ').columns.at(-1)?.name).toBe(' Notes ')
  })

  it('does not mutate the config it was given', () => {
    const original = config()

    withAddedColumn(original, 'Notes')

    expect(original.columns).toHaveLength(2)
  })
})

describe('withoutColumn', () => {
  it('drops the column at the given index', () => {
    expect(withoutColumn(config(), 0).columns).toEqual([{ name: 'Country', selector: './td[2]' }])
  })

  it('leaves the rest of the config alone', () => {
    expect(withoutColumn(config(), 0).mainSelector).toBe('//tr')
  })

  it('does not mutate the config it was given', () => {
    const original = config()

    withoutColumn(original, 0)

    expect(original.columns).toHaveLength(2)
  })

  it('leaves the columns intact for an index past the end', () => {
    expect(withoutColumn(config(), 9).columns).toHaveLength(2)
  })

  it('can empty the list entirely', () => {
    expect(withoutColumn(withoutColumn(config(), 0), 0).columns).toEqual([])
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
