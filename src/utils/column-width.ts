/**
 * Estimating how wide a data column should be.
 *
 * Both tables size their columns the same way but at different scales — the
 * side panel is narrow, the full data view is not — so the metrics are a
 * parameter rather than two near-identical copies of the arithmetic.
 */

export interface ColumnWidthMetrics {
  /** Widths for the columns a table adds itself, keyed by column id. */
  fixedWidths: Record<string, number>
  /** Width for a column the config does not describe. */
  unknownWidth: number
  /** How many rows to measure; enough to be representative, few enough to be quick. */
  sampleSize: number
  /** Approximate width of one character in the table's font. */
  charWidth: number
  /** Horizontal cell padding to add on top of the text. */
  padding: number
  minWidth: number
  maxWidth: number
}

export const SIDE_PANEL_COLUMN_METRICS: ColumnWidthMetrics = {
  fixedWidths: { rowIndex: 40, actions: 60 },
  unknownWidth: 150,
  sampleSize: 50,
  charWidth: 7,
  padding: 20,
  minWidth: 80,
  maxWidth: 300,
}

export const FULL_DATA_VIEW_COLUMN_METRICS: ColumnWidthMetrics = {
  fixedWidths: { select: 35, rowIndex: 35, actions: 75 },
  unknownWidth: 200,
  sampleSize: 100,
  charWidth: 8,
  padding: 24,
  minWidth: 100,
  maxWidth: 400,
}

/**
 * Width to give a column, from the longest value among the first rows.
 *
 * An approximation: character count times an average glyph width, clamped so a
 * column is never unusably narrow nor wide enough to push the rest off-screen.
 */
export const calculateOptimalColumnWidth = (
  columnId: string,
  rows: ScrapedRow[],
  config: ScrapeConfig,
  metrics: ColumnWidthMetrics,
): number => {
  const fixed = metrics.fixedWidths[columnId]
  if (fixed !== undefined) return fixed

  const columnIndex = config.columns.findIndex((column) => column.name === columnId)
  if (columnIndex === -1) return metrics.unknownWidth

  const dataKey = config.columns[columnIndex]?.key || columnId
  const longest = rows.slice(0, metrics.sampleSize).reduce(
    (max, row) => Math.max(max, String(row.data[dataKey] || '').length),
    columnId.length, // The header has to fit too.
  )

  return Math.min(
    Math.max(longest * metrics.charWidth + metrics.padding, metrics.minWidth),
    metrics.maxWidth,
  )
}
