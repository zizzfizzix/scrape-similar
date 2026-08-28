/**
 * Immutable edits to a `ScrapeConfig`'s column list.
 *
 * Split out of `ConfigForm.tsx`, where the same copy-splice-spread dance was
 * repeated for every kind of edit.
 */

/** Selector a freshly added column starts with: the row's own text. */
export const DEFAULT_COLUMN_SELECTOR = '.'

/** Rename one column, leaving the config untouched if the index is out of range. */
export const withColumnName = (config: ScrapeConfig, index: number, name: string): ScrapeConfig => {
  const column = config.columns[index]
  if (!column) return config

  const columns = [...config.columns]
  columns[index] = { ...column, name }
  return { ...config, columns }
}

export const withColumnSelector = (
  config: ScrapeConfig,
  index: number,
  selector: string,
): ScrapeConfig => {
  const column = config.columns[index]
  if (!column) return config

  const columns = [...config.columns]
  columns[index] = { ...column, selector }
  return { ...config, columns }
}

/** Append a column named `name`. Blank names are ignored. */
export const withAddedColumn = (config: ScrapeConfig, name: string): ScrapeConfig => {
  if (!name.trim()) return config

  return {
    ...config,
    columns: [...config.columns, { name, selector: DEFAULT_COLUMN_SELECTOR }],
  }
}

export const withoutColumn = (config: ScrapeConfig, index: number): ScrapeConfig => ({
  ...config,
  columns: config.columns.filter((_, i) => i !== index),
})

/**
 * Collapse newlines to spaces.
 *
 * The main selector is edited in a textarea so long expressions wrap, but an
 * XPath expression is a single line, and a pasted one often arrives with breaks.
 */
export const sanitizeToSingleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ')
