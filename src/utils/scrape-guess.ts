/**
 * Column guessing for the "auto-generate config" flow.
 *
 * Split out of `scraper.ts` so each piece is independently testable: picking the
 * repeating ancestor, deriving a table row's selector, and mapping a tag name to
 * the columns worth extracting.
 */

/** How far up the tree to look for a repeating unit. */
const MAX_ANCESTOR_LEVELS = 6

/** Never treat the document shell as a repeating unit. */
const NON_REPEATING_TAGS = new Set(['html', 'body'])

/**
 * Broad layout containers only count as a repeating unit when there are enough
 * of them, otherwise a single `<section>` wrapper would swallow the selection.
 */
const LAYOUT_TAGS = new Set(['section', 'article', 'main', 'aside', 'figure'])
const MIN_LAYOUT_SIBLINGS = 3

/** Row-ish tags that mark a repeated record when the parent holds several. */
const ROW_TAGS = ['tr', 'li', 'dt', 'dd'] as const

const getText = (element: Element): string => element.textContent?.trim() || ''

/** Every `data-*` attribute on the element, as its own column. */
export const getDataAttributes = (element: Element): ColumnDefinition[] =>
  Array.from(element.attributes)
    .filter((attribute) => attribute.name.startsWith('data-'))
    .map((attribute) => ({ name: attribute.name, selector: `@${attribute.name}` }))

/**
 * Nearest `tr`/`li`/`dt`/`dd` ancestor (including self) whose parent holds more
 * than one sibling of that same tag, i.e. a genuinely repeated record.
 */
export const findRepeatedRowAncestor = (element: HTMLElement): HTMLElement | null => {
  for (const tag of ROW_TAGS) {
    const candidate = element.closest(tag) as HTMLElement | null
    const siblingCount = candidate?.parentElement?.querySelectorAll(`:scope > ${tag}`).length ?? 0
    if (siblingCount > 1) return candidate
  }
  return null
}

/**
 * Nearest ancestor (including self) that has same-tag siblings, falling back to
 * the element itself when nothing repeats within `MAX_ANCESTOR_LEVELS`.
 */
export const findNearestRepeatingNode = (start: HTMLElement): HTMLElement => {
  let node: HTMLElement | null = start
  let levels = 0

  while (node && levels <= MAX_ANCESTOR_LEVELS) {
    const tag = node.tagName.toLowerCase()
    if (!NON_REPEATING_TAGS.has(tag) && node.parentElement) {
      const sameTagSiblings = Array.from(node.parentElement.children).filter(
        (sibling) => sibling.tagName.toLowerCase() === tag,
      )
      const isRepeating = sameTagSiblings.length > 1
      const isTooBroad = LAYOUT_TAGS.has(tag) && sameTagSiblings.length < MIN_LAYOUT_SIBLINGS
      if (isRepeating && !isTooBroad) return node
    }
    node = node.parentElement
    levels += 1
  }

  return start
}

/** The element whose repetition defines one scraped row. */
export const findScrapeAncestor = (element: HTMLElement): HTMLElement =>
  findRepeatedRowAncestor(element) ?? findNearestRepeatingNode(element)

/**
 * Header cells that label the columns of `row`, searched in order of
 * reliability: the last `thead` row, then the closest preceding row with `th`
 * cells, then any `th` in the table.
 */
const findTableHeaderCells = (table: HTMLTableElement, row: HTMLElement): Element[] => {
  const thsIn = (headerRow: Element) =>
    Array.from(headerRow.children).filter((child) => child.tagName.toLowerCase() === 'th')

  const theadRow = Array.from(table.querySelectorAll('thead tr')).at(-1)
  if (theadRow) {
    const cells = thsIn(theadRow)
    if (cells.length > 0) return cells
  }

  const allRows = Array.from(table.querySelectorAll('tr'))
  const rowsAbove = allRows.slice(0, allRows.indexOf(row as HTMLTableRowElement)).reverse()
  for (const headerRow of rowsAbove) {
    const cells = thsIn(headerRow)
    if (cells.length > 0) return cells
  }

  return Array.from(table.querySelectorAll('th'))
}

/**
 * Selector matching every data row of the table `row` belongs to, or null when
 * the row is not inside a table (in which case the caller keeps its own path).
 */
export const buildTableRowSelector = (row: HTMLElement): string | null => {
  const table = row.closest('table')
  if (!table) return null

  const tableIndex = Array.from(document.querySelectorAll('table')).indexOf(table) + 1
  return `(//table)[${tableIndex}]//tr[td]`
}

/**
 * One column per table cell, named after the matching header cell where one
 * exists. Positional selectors (`*[n]`) so both `th` and `td` cells are picked
 * up, and stable `key`s so duplicate header names stay distinguishable.
 */
export const buildTableRowColumns = (row: HTMLElement): ColumnDefinition[] => {
  const table = row.closest('table')
  const headerCells = table ? findTableHeaderCells(table, row) : []
  const cells = Array.from(row.children).filter((child) =>
    ['th', 'td'].includes(child.tagName.toLowerCase()),
  )

  const columnCount = Math.max(headerCells.length, cells.length)
  return Array.from({ length: columnCount }, (_, i) => {
    const headerCell = headerCells[i]
    return {
      name: (headerCell && getText(headerCell)) || `Column ${i + 1}`,
      key: `col${i + 1}`,
      selector: `*[${i + 1}]`,
    }
  })
}

/**
 * Columns worth extracting for a given tag. Each builder returns the columns
 * specific to that element; `data-*` attributes are appended by the dispatcher.
 */
const COLUMN_BUILDERS: Record<string, (element: HTMLElement) => ColumnDefinition[]> = {
  a: () => [
    { name: 'Anchor text', selector: '.' },
    { name: 'URL', selector: '@href' },
    { name: 'Rel', selector: '@rel' },
    { name: 'Target', selector: '@target' },
  ],
  img: () => [
    { name: 'Alt Text', selector: '@alt' },
    { name: 'Source', selector: '@src' },
    { name: 'Title', selector: '@title' },
  ],
  button: () => [
    { name: 'Text', selector: '.' },
    { name: 'Value', selector: '@value' },
    { name: 'ARIA Label', selector: '@aria-label' },
    { name: 'Disabled', selector: '@disabled' },
  ],
  input: (element) => {
    const columns: ColumnDefinition[] = [
      { name: 'Value', selector: '@value' },
      { name: 'Placeholder', selector: '@placeholder' },
      { name: 'Name', selector: '@name' },
      { name: 'Type', selector: '@type' },
    ]
    const type = element.getAttribute('type') || ''
    if (type === 'checkbox' || type === 'radio') {
      columns.push({ name: 'Checked', selector: '@checked' })
    }
    return columns
  },
  textarea: () => [
    { name: 'Value', selector: '.' },
    { name: 'Placeholder', selector: '@placeholder' },
    { name: 'Name', selector: '@name' },
  ],
  select: () => [
    { name: 'Selected Option', selector: 'option[@selected]' },
    { name: 'Name', selector: '@name' },
  ],
  dt: () => [
    { name: 'Term', selector: '.' },
    { name: 'Definition', selector: './following-sibling::dd' },
  ],
  li: () => [{ name: 'List Item', selector: '.' }],
  figure: () => [
    { name: 'Image Source', selector: './/img/@src' },
    { name: 'Image Alt', selector: './/img/@alt' },
    { name: 'Image Title', selector: './/img/@title' },
    { name: 'Caption', selector: 'figcaption' },
    { name: 'Code', selector: 'pre|code' },
    { name: 'Blockquote', selector: 'blockquote' },
    { name: 'Paragraph', selector: 'p' },
    { name: 'Figure Text', selector: '.' },
  ],
  blockquote: () => [
    { name: 'Quote', selector: '.' },
    { name: 'Citation', selector: '@cite' },
    { name: 'Footer', selector: 'footer' },
    { name: 'Cite Element', selector: 'cite' },
  ],
  colgroup: () => [
    { name: 'Span', selector: '@span' },
    { name: 'Class', selector: '@class' },
    { name: 'Style', selector: '@style' },
  ],
  table: (element) => {
    const headerCells = Array.from(element.querySelectorAll('th'))
    const colElements = Array.from(element.querySelectorAll('col'))
    return [
      ...(element.querySelector('caption') ? [{ name: 'Caption', selector: 'caption' }] : []),
      ...headerCells.map((cell, i) => ({
        name: getText(cell) || `Column ${i + 1}`,
        selector: `.//tr/td[${i + 1}]`,
      })),
      { name: 'Col Count', selector: 'count(col)' },
      ...colElements.map((_, i) => ({
        name: `Col ${i + 1} Span`,
        selector: `.//col[${i + 1}]/@span`,
      })),
    ]
  },
  dl: () => [
    { name: 'Term', selector: 'dt' },
    { name: 'Definition', selector: 'dd' },
  ],
  form: () => [
    { name: 'Action', selector: '@action' },
    { name: 'Method', selector: '@method' },
    { name: 'Input Names', selector: './/input/@name' },
    { name: 'Input Types', selector: './/input/@type' },
  ],
  nav: () => [
    { name: 'Text', selector: '.' },
    { name: 'ARIA Label', selector: '@aria-label' },
    { name: 'Links', selector: 'a/@href' },
  ],
  details: () => [
    { name: 'Summary', selector: 'summary' },
    { name: 'Details', selector: '.' },
  ],
  summary: () => [{ name: 'Summary', selector: '.' }],
}

/** Headings share one shape. */
for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
  COLUMN_BUILDERS[tag] = () => [
    { name: 'Heading', selector: '.' },
    { name: 'ARIA Label', selector: '@aria-label' },
  ]
}

/** Sectioning containers additionally surface their first heading. */
for (const tag of ['article', 'section', 'main', 'aside']) {
  COLUMN_BUILDERS[tag] = (element) => {
    const columns: ColumnDefinition[] = [
      { name: 'Text', selector: '.' },
      { name: 'ARIA Label', selector: '@aria-label' },
    ]
    const heading = element.querySelector('h1,h2,h3,h4,h5,h6')
    if (heading) columns.push({ name: 'Headline', selector: heading.tagName.toLowerCase() })
    return columns
  }
}

/** Code blocks additionally surface the caption of an enclosing figure. */
for (const tag of ['pre', 'code']) {
  COLUMN_BUILDERS[tag] = (element) => {
    const columns: ColumnDefinition[] = [
      { name: 'Code', selector: '.' },
      { name: 'Language', selector: '@data-language' },
      { name: 'Class', selector: '@class' },
    ]
    if (element.parentElement?.tagName.toLowerCase() === 'figure') {
      columns.push({ name: 'Caption', selector: 'figcaption' })
    }
    return columns
  }
}

/** `col` shares `colgroup`'s shape; lists share `li`'s. */
COLUMN_BUILDERS.col = COLUMN_BUILDERS.colgroup!
for (const tag of ['ul', 'ol']) {
  COLUMN_BUILDERS[tag] = () => [{ name: 'List Item', selector: 'li' }]
}
for (const tag of ['header', 'footer']) {
  COLUMN_BUILDERS[tag] = () => [
    { name: 'Text', selector: '.' },
    { name: 'ARIA Label', selector: '@aria-label' },
  ]
}
for (const tag of ['video', 'audio']) {
  COLUMN_BUILDERS[tag] = () => [
    { name: 'Source', selector: 'source/@src' },
    { name: 'Poster', selector: '@poster' },
    { name: 'Controls', selector: '@controls' },
    { name: 'Captions', selector: 'track/@src' },
  ]
}

/** Anything with no dedicated builder: its text, plus an ARIA label if present. */
const buildDefaultColumns = (element: HTMLElement): ColumnDefinition[] => [
  ...(element.hasAttribute('aria-label') ? [{ name: 'ARIA Label', selector: '@aria-label' }] : []),
  { name: 'Text', selector: '.' },
]

/**
 * Columns to extract for one repeated element, including its `data-*`
 * attributes. `tr` is handled by `buildTableRowColumns`, which needs the
 * surrounding table.
 */
export const buildColumnsForElement = (element: HTMLElement): ColumnDefinition[] => {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'tr') return buildTableRowColumns(element)

  const build = COLUMN_BUILDERS[tagName] ?? buildDefaultColumns
  return [...build(element), ...getDataAttributes(element)]
}
