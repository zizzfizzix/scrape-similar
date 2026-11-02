/**
 * The scrape config's defaults and immutable edits to its column list. Kept
 * free of panel-only dependencies, since the background imports it too.
 */

/** Selector a freshly added column starts with: the row's own text. */
export const DEFAULT_COLUMN_SELECTOR = '.'

const isSameColumn = (a: ColumnDefinition, b: ColumnDefinition): boolean =>
  a.name === b.name && a.selector === b.selector && a.key === b.key

/**
 * `columns` with `edit` applied, or `null` when the edit targets a column that
 * is no longer at its index as it was when the edit was made.
 */
export const applyColumnEdit = (
  columns: ColumnDefinition[],
  edit: ColumnEdit,
): ColumnDefinition[] | null => {
  if (edit.type === 'add') return [...columns, edit.column]

  const stored = columns[edit.index]
  if (!stored || !isSameColumn(stored, edit.expected)) return null

  if (edit.type === 'remove') return columns.filter((_, i) => i !== edit.index)
  return columns.map((column, i) => (i === edit.index ? edit.column : column))
}

/**
 * Collapse newlines to spaces.
 *
 * The main selector is edited in a textarea so long expressions wrap, but an
 * XPath expression is a single line, and a pasted one often arrives with breaks.
 */
export const sanitizeToSingleLine = (value: string): string => value.replace(/[\r\n]+/g, ' ')

/**
 * Every config the panel shows passes through here, so code comparing a
 * committed main selector never has to trim either side.
 */
export const withTrimmedMainSelector = (config: ScrapeConfig): ScrapeConfig => {
  const mainSelector = config.mainSelector.trim()
  return mainSelector === config.mainSelector ? config : { ...config, mainSelector }
}

/** Columns assumed before the user has configured any. */
export const DEFAULT_SCRAPE_CONFIG: ScrapeConfig = {
  mainSelector: '',
  columns: [{ name: 'Text', selector: '.' }],
}

// A stored config wins. Failing that, a right-click that recorded an element
// seeds the main selector from it. Otherwise the panel starts blank.
const resolveUntrimmedStoredConfig = ({
  currentScrapeConfig,
  elementDetails,
}: SidePanelConfig): ScrapeConfig =>
  currentScrapeConfig
    ? {
        ...DEFAULT_SCRAPE_CONFIG,
        ...currentScrapeConfig,
        // A stored config with no columns cannot produce anything, so keep the default.
        columns:
          Array.isArray(currentScrapeConfig.columns) && currentScrapeConfig.columns.length > 0
            ? currentScrapeConfig.columns
            : DEFAULT_SCRAPE_CONFIG.columns,
      }
    : elementDetails?.xpath
      ? { ...DEFAULT_SCRAPE_CONFIG, mainSelector: elementDetails.xpath }
      : DEFAULT_SCRAPE_CONFIG

/** The config to show for a stored session state. */
export const resolveStoredConfig = (stored: SidePanelConfig): ScrapeConfig =>
  withTrimmedMainSelector(resolveUntrimmedStoredConfig(stored))
