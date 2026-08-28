import log from 'loglevel'
import { buildColumnsForElement, buildTableRowSelector, findScrapeAncestor } from './scrape-guess'

/**
 * Scrape data from the page based on the provided configuration
 * Returns data with original indices and empty row flags
 */
export const scrapePage = (config: ScrapeConfig): ScrapedData => {
  try {
    const { mainSelector, columns } = config
    const results: ScrapedData = []

    // Find all primary elements using the main selector
    const primaryElements = evaluateXPath(mainSelector)

    // For each primary element, extract data for each column
    primaryElements.forEach((element, index) => {
      const rowData: ScrapedRowData = {}

      // Process each column
      columns.forEach((column) => {
        const dataKey = column.key || column.name
        rowData[dataKey] = extractData(element, column)
      })

      // Check if row is empty (all column values are empty)
      const isEmpty = !Object.keys(rowData).some((key) => (rowData[key] || '').trim() !== '')

      const row: ScrapedRow = {
        data: rowData,
        metadata: {
          originalIndex: index,
          isEmpty: isEmpty,
        },
      }

      // Always add to results (filtering will be done in the UI)
      results.push(row)
    })

    return results
  } catch (error) {
    log.error('Error scraping page:', error)
    return []
  }
}

/**
 * Evaluate an XPath expression and return matching values (element, attribute, or text).
 */
export const evaluateXPathValues = (
  xpath: string,
  contextNode: Node = document,
): (string | HTMLElement)[] => {
  const results: (string | HTMLElement)[] = []
  try {
    const xpathResult = document.evaluate(
      xpath,
      contextNode,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    )
    for (let i = 0; i < xpathResult.snapshotLength; i++) {
      const node = xpathResult.snapshotItem(i)
      if (node instanceof HTMLElement) {
        results.push(node)
      } else if (node && node.nodeType === Node.ATTRIBUTE_NODE) {
        results.push((node as Attr).value)
      } else if (node && node.nodeType === Node.TEXT_NODE) {
        results.push(node.textContent || '')
      }
    }
  } catch (error) {
    log.error('Error evaluating XPath:', error)
  }
  return results
}

/**
 * Extract data from an element using a column definition (supports attribute/text XPath).
 */
export const extractData = (element: HTMLElement, column: ColumnDefinition): string => {
  try {
    const { selector } = column

    // Special case: if selector is '.', extract text content of the element itself
    if (selector === '.') {
      return element.textContent?.trim() || ''
    }

    // Special case: if selector starts with '@', extract attribute
    if (selector.startsWith('@') && !selector.includes('(')) {
      const attributeName = selector.substring(1)
      return element.getAttribute(attributeName) || ''
    }

    // Try to evaluate as string first (for functions like local-name(), substring(), etc.)
    try {
      const stringResult = document.evaluate(selector, element, null, XPathResult.STRING_TYPE, null)
      if (stringResult.stringValue) {
        return stringResult.stringValue.trim()
      }
    } catch (stringError) {
      // If string evaluation fails, fall back to node evaluation
      log.debug('String XPath evaluation failed, trying node evaluation:', stringError)
    }

    // Fall back to node evaluation for selectors that return nodes
    const [first] = evaluateXPathValues(selector, element)
    if (first === undefined) return ''
    // Attributes and text nodes come back as their string value; elements
    // contribute their text. `textContent` is only null on Document and
    // DocumentType nodes, which `evaluateXPathValues` never returns.
    return typeof first === 'string' ? first.trim() : first.textContent!.trim()
  } catch (error) {
    log.error('Error extracting data:', error)
    return ''
  }
}

/**
 * Evaluate an XPath expression and return matching elements
 */
export const evaluateXPath = (xpath: string, contextNode: Node = document): HTMLElement[] => {
  const results: HTMLElement[] = []
  const xpathResult = document.evaluate(
    xpath,
    contextNode,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  )

  for (let i = 0; i < xpathResult.snapshotLength; i++) {
    const node = xpathResult.snapshotItem(i)
    if (node instanceof HTMLElement) {
      results.push(node)
    }
  }

  return results
}

/**
 * Returns the index of the element among siblings with the same tag name.
 * Only returns an index if there are multiple siblings of the same tag.
 */
const getElementIndex = (node: Element, parent: ParentNode): number | null => {
  const siblings = Array.from(parent.children).filter(
    (sibling) => sibling.nodeName === node.nodeName,
  )
  if (siblings.length > 1) {
    return siblings.indexOf(node) + 1
  }
  return null
}

/**
 * Generates a general XPath for a node, only adding indices when necessary.
 * Only considers ELEMENT_NODEs.
 */
export const generateXPath = (node: Node): string => {
  const parent = node?.parentNode
  if (!parent || node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  if (node === document.body) {
    return '/html/body'
  }
  const element = node as Element
  const tag = element.nodeName.toLowerCase()
  const index = getElementIndex(element, parent)
  const segment = index ? `${tag}[${index}]` : tag
  return `${generateXPath(parent)}/${segment}`
}

/**
 * Evaluate an XPath and return the number of matches, treating an expression the
 * engine rejects as zero matches.
 */
export const countXPathMatches = (xpath: string, contextNode: Node = document): number => {
  try {
    const result = document.evaluate(
      xpath,
      contextNode,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    )
    return result.snapshotLength
  } catch {
    return 0
  }
}

/**
 * Minimizes an XPath by removing unnecessary predicates and leading segments,
 * while ensuring it still uniquely identifies the node.
 * Returns the shortest unique XPath for the node.
 */
export const minimizeXPath = (node: Element): string => {
  let xpath = generateXPath(node)
  const xpathLastPredicateRegex = /^(.*)(\[\d+\])([^\[\]]*)$/
  const xpathFirstSegmentRegex = /^(\/+[^\/]+)(.*)$/
  let result: RegExpExecArray | null
  let selection: number | undefined

  // Remove last predicate until we match more than one node
  while ((result = xpathLastPredicateRegex.exec(xpath))) {
    selection = countXPathMatches(xpath)
    if (selection > 1) {
      break
    }
    // Every group is mandatory in the pattern, so a successful match always
    // fills them; group 3 can be empty but never absent.
    xpath = `${result[1]!}${result[3]!}`
  }

  if (selection === undefined) {
    return xpath
  }

  // Trim the front of the path until we have the smallest XPath that returns the same number of elements
  while ((result = xpathFirstSegmentRegex.exec(xpath))) {
    // As above: a successful match always fills group 2.
    const trimmed = `/${result[2]!}`
    const trimmedCount = countXPathMatches(trimmed)
    if (trimmedCount !== selection) {
      break
    }
    xpath = trimmed
  }

  return xpath
}

/**
 * Guess a ScrapeConfig for a given element, inspired by bit155 logic but modernized.
 *
 * Picks the repeating ancestor that best represents one record, then asks
 * `scrape-guess` for the columns worth extracting from it. Table rows get a
 * table-wide selector so every data row is matched, not just the clicked one.
 */
export const guessScrapeConfigForElement = (element: HTMLElement): ScrapeConfig => {
  const ancestor = findScrapeAncestor(element)
  const isTableRow = ancestor.tagName.toLowerCase() === 'tr'

  return {
    mainSelector: (isTableRow ? buildTableRowSelector(ancestor) : null) ?? minimizeXPath(ancestor),
    columns: buildColumnsForElement(ancestor),
  }
}
