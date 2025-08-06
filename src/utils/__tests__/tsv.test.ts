import { describe, expect, it } from 'vitest'

import { rowToTsv, rowsToTsv } from '@/utils/tsv'
import { ScrapedRow } from '@/utils/types'

// Helper to build ScrapedRow quickly
const makeRow = (data: Record<string, any>): ScrapedRow => ({
  data,
  metadata: { originalIndex: 0, isEmpty: false },
})

describe('tsv utilities', () => {
  const columnKeys = ['col1', 'col2', 'col3']

  it('rowToTsv escapes special characters and preserves column order', () => {
    const row = makeRow({
      col1: 'Hello\tWorld', // tab in value should be escaped
      col2: 'Line\nBreak', // newline in value should be escaped
      col3: 'Backslash \\ test', // backslash should be escaped
    })

    const result = rowToTsv(row, columnKeys)

    // Expected: special chars escaped, separated by real tab characters
    expect(result).toBe('Hello\\tWorld\tLine\\nBreak\tBackslash \\\\ test')
  })

  it('rowToTsv inserts empty strings for missing keys', () => {
    const row = makeRow({ col1: 'A', col3: 'C' })

    const result = rowToTsv(row, columnKeys)

    expect(result).toBe('A\t\tC')
  })

  it('rowsToTsv builds TSV with header row', () => {
    const rows: ScrapedRow[] = [
      makeRow({ col1: '1', col2: '2', col3: '3' }),
      makeRow({ col1: '4', col2: '5', col3: '6' }),
    ]
    const header = ['Column 1', 'Column 2', 'Column 3']

    const result = rowsToTsv(rows, columnKeys, header)

    const expected = ['Column 1\tColumn 2\tColumn 3', '1\t2\t3', '4\t5\t6'].join('\n')

    expect(result).toBe(expected)
  })

  it('rowsToTsv without header returns only data lines', () => {
    const rows: ScrapedRow[] = [makeRow({ col1: 'x', col2: 'y', col3: 'z' })]

    const result = rowsToTsv(rows, columnKeys)

    expect(result).toBe('x\ty\tz')
  })

  it('rowToTsv coerces numbers, booleans, and nullish values correctly', () => {
    const row = makeRow({ col1: 123, col2: false, col3: null })

    const result = rowToTsv(row, columnKeys)

    // null -> empty string, 123 -> "123", false -> "false"
    expect(result).toBe('123\tfalse\t')
  })

  it('rowToTsv and rowsToTsv handle empty columnKeys', () => {
    const emptyKeys: string[] = []
    const row = makeRow({ any: 'thing' })

    expect(rowToTsv(row, emptyKeys)).toBe('')
    expect(rowsToTsv([row], emptyKeys)).toBe('')
  })

  it('rowsToTsv escapes header values containing special characters', () => {
    const rows: ScrapedRow[] = [makeRow({ col1: 'a', col2: 'b', col3: 'c' })]
    const headerWithSpecials = ['Head\t1', 'Head\n2', 'Back\\slash']

    const result = rowsToTsv(rows, columnKeys, headerWithSpecials)

    const expectedHeader = 'Head\\t1\tHead\\n2\tBack\\\\slash'
    const expected = [expectedHeader, 'a\tb\tc'].join('\n')

    expect(result).toBe(expected)
  })

  it('rowToTsv escapes leading/trailing tab and newline characters', () => {
    const row = makeRow({ col1: '\tstart', col2: 'end\n', col3: '\nmid\t' })

    const result = rowToTsv(row, columnKeys)

    expect(result).toBe('\\tstart\tend\\n\t\\nmid\\t')
  })

  it('rowToTsv escapes carriage return and newline combos', () => {
    const row = makeRow({ col1: '\r\ncombo', col2: 'solo\r', col3: '\n' })

    const result = rowToTsv(row, columnKeys)

    expect(result).toBe('\\r\\ncombo\tsolo\\r\t\\n')
  })

  it('rowToTsv keeps high-unicode / emoji characters intact while escaping tabs', () => {
    const row = makeRow({ col1: '😃\t👍', col2: '🚀', col3: '✨' })

    const result = rowToTsv(row, columnKeys)

    expect(result).toBe('😃\\t👍\t🚀\t✨')
  })

  it('rowToTsv ignores extra keys not present in columnKeys', () => {
    const row = makeRow({ col1: 'A', col2: 'B', col3: 'C', extra: 'ignore me' })

    const result = rowToTsv(row, columnKeys)

    expect(result).toBe('A\tB\tC')
  })

  it('rowsToTsv handles rows with uneven keys (more or fewer than columnKeys)', () => {
    const rows: ScrapedRow[] = [
      // fewer keys
      makeRow({ col1: '1' }),
      // exact keys
      makeRow({ col1: '2', col2: '3', col3: '4' }),
      // more keys
      makeRow({ col1: '5', col2: '6', col3: '7', extra: '8' }),
    ]

    const result = rowsToTsv(rows, columnKeys)

    expect(result).toBe(['1\t\t', '2\t3\t4', '5\t6\t7'].join('\n'))
  })
})
