import {
  calculateOptimalColumnWidth,
  FULL_DATA_VIEW_COLUMN_METRICS,
  SIDE_PANEL_COLUMN_METRICS,
  type ColumnWidthMetrics,
} from '@/utils/column-width'
import type { ScrapeConfig, ScrapedRow } from '@/utils/types'
import { describe, expect, it } from 'vitest'

const row = (data: Record<string, string>, originalIndex = 0): ScrapedRow => ({
  data,
  metadata: { originalIndex, isEmpty: false },
})

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [
    { name: 'Title', selector: '.' },
    { name: 'Keyed', selector: '.', key: 'col2' },
  ],
}

const widthIn = (metrics: ColumnWidthMetrics, columnId: string, rows: ScrapedRow[] = []) =>
  calculateOptimalColumnWidth(columnId, rows, config, metrics)

describe('calculateOptimalColumnWidth', () => {
  it('uses the fixed width for a column the table adds itself', () => {
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'select')).toBe(35)
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'rowIndex')).toBe(35)
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'actions')).toBe(75)
  })

  it('uses the side panel’s own fixed widths', () => {
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'rowIndex')).toBe(40)
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'actions')).toBe(60)
  })

  it('has no tick-box column in the side panel, so sizes it like any other', () => {
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'select')).toBe(
      SIDE_PANEL_COLUMN_METRICS.unknownWidth,
    )
  })

  it('falls back to a default for a column the config does not describe', () => {
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Unknown')).toBe(200)
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'Unknown')).toBe(150)
  })

  it('sizes to the longest value it finds', () => {
    const rows = [row({ Title: 'a'.repeat(30) })]

    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', rows)).toBe(30 * 8 + 24)
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'Title', rows)).toBe(30 * 7 + 20)
  })

  it('never sizes below the minimum', () => {
    const rows = [row({ Title: 'a' })]

    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', rows)).toBe(100)
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'Title', rows)).toBe(80)
  })

  it('never sizes above the maximum', () => {
    const rows = [row({ Title: 'a'.repeat(500) })]

    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', rows)).toBe(400)
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'Title', rows)).toBe(300)
  })

  it('makes room for a header longer than every value', () => {
    const longHeader = 'H'.repeat(40)
    const wideConfig: ScrapeConfig = {
      mainSelector: '//tr',
      columns: [{ name: longHeader, selector: '.' }],
    }

    expect(
      calculateOptimalColumnWidth(
        longHeader,
        [row({ [longHeader]: 'a' })],
        wideConfig,
        FULL_DATA_VIEW_COLUMN_METRICS,
      ),
    ).toBe(40 * 8 + 24)
  })

  it('reads values by the column’s internal key when it has one', () => {
    const rows = [row({ col2: 'a'.repeat(30), Keyed: '' })]

    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Keyed', rows)).toBe(30 * 8 + 24)
  })

  it('samples only as many rows as the metrics allow', () => {
    const rows = [
      ...Array.from({ length: 50 }, () => row({ Title: 'short' })),
      row({ Title: 'a'.repeat(300) }, 50),
    ]

    // The long row sits just past the side panel's 50-row sample...
    expect(widthIn(SIDE_PANEL_COLUMN_METRICS, 'Title', rows)).toBe(80)
    // ...but within the full data view's 100.
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', rows)).toBe(400)
  })

  it('treats a missing value as empty', () => {
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', [row({})])).toBe(100)
  })

  it('sizes an empty table from the header alone', () => {
    expect(widthIn(FULL_DATA_VIEW_COLUMN_METRICS, 'Title', [])).toBe(100)
  })
})
