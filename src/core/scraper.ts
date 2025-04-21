import { ColumnDefinition, ScrapeConfig, ScrapedData, ScrapedRow, SelectorLanguage } from './types'

/**
 * Scrape data from the page based on the provided configuration
 */
export const scrapePage = (config: ScrapeConfig): ScrapedData => {
  try {
    const { mainSelector, language, columns } = config
    const results: ScrapedRow[] = []

    // Find all primary elements using the main selector
    const primaryElements = findElements(mainSelector, language)

    // For each primary element, extract data for each column
    primaryElements.forEach((element) => {
      const row: ScrapedRow = {}

      // Process each column
      columns.forEach((column) => {
        row[column.name] = extractData(element, column)
      })

      // Add the row to results (if not empty)
      if (Object.values(row).some((value) => value.trim() !== '')) {
        results.push(row)
      }
    })

    return results
  } catch (error) {
    console.error('Error scraping page:', error)
    return []
  }
}

/**
 * Find elements using the provided selector and language
 */
export const findElements = (selector: string, language: SelectorLanguage): HTMLElement[] => {
  if (language === 'xpath') {
    return evaluateXPath(selector)
  } else {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[]
  }
}

/**
 * Extract data from an element using a column definition
 */
export const extractData = (element: HTMLElement, column: ColumnDefinition): string => {
  try {
    const { selector, language } = column

    // Special case: if selector is '.', extract text content of the element itself
    if (selector === '.') {
      return element.textContent?.trim() || ''
    }

    // Special case: if selector starts with '@', extract attribute
    if (selector.startsWith('@')) {
      const attributeName = selector.substring(1)
      return element.getAttribute(attributeName) || ''
    }

    // Otherwise, find child elements and extract text from the first match
    const childElements =
      language === 'xpath'
        ? evaluateXPath(selector, element)
        : (Array.from(element.querySelectorAll(selector)) as HTMLElement[])

    if (childElements.length > 0) {
      return childElements[0].textContent?.trim() || ''
    }

    return ''
  } catch (error) {
    console.error('Error extracting data:', error)
    return ''
  }
}

/**
 * Evaluate an XPath expression and return matching elements
 */
export const evaluateXPath = (xpath: string, contextNode: Node = document): HTMLElement[] => {
  const results: HTMLElement[] = []
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
      }
    }
  } catch (error) {
    console.error('Error evaluating XPath:', error)
  }

  return results
}

/**
 * Returns the index of the element among siblings with the same tag name.
 * Only returns an index if there are multiple siblings of the same tag.
 */
const getElementIndex = (node: Element): number | null => {
  if (!node.parentNode) return null
  const siblings = Array.from(node.parentNode.children).filter(
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
  if (!node || !node.parentNode || node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  if (node === document.body) {
    return '/html/body'
  }
  const element = node as Element
  const tag = element.nodeName.toLowerCase()
  const index = getElementIndex(element)
  const segment = index ? `${tag}[${index}]` : tag
  return node.parentNode ? `${generateXPath(node.parentNode)}/${segment}` : `/${segment}`
}

/**
 * Helper to evaluate an XPath and return the number of matches.
 */
const countXPathMatches = (xpath: string, contextNode: Node = document): number => {
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
    xpath = result[1] + result[3]
  }

  if (selection === undefined) {
    return xpath
  }

  // Trim the front of the path until we have the smallest XPath that returns the same number of elements
  while ((result = xpathFirstSegmentRegex.exec(xpath))) {
    const trimmed = '/' + result[2]
    const trimmedCount = countXPathMatches(trimmed)
    if (trimmedCount !== selection) {
      break
    }
    xpath = trimmed
  }

  return xpath
}

/**
 * Generate CSS selector for an element
 */
export const generateCssSelector = (element: HTMLElement): string => {
  // Generate unique selector based on ID, classes, and position
  if (element.id) {
    return `#${element.id}`
  }

  // Try with class names if they're not too common
  if (element.className) {
    const classes = element.className.split(' ').filter((c) => c.trim())
    if (classes.length > 0) {
      const selector = `.${classes.join('.')}`
      if (document.querySelectorAll(selector).length === 1) {
        return selector
      }
    }
  }

  // Fall back to tag name and position
  let selector = element.tagName.toLowerCase()
  let parent = element.parentElement

  if (parent) {
    // Add parent information for more specificity
    if (parent.id) {
      return `#${parent.id} > ${selector}`
    }

    // Try adding nth-child for specificity
    const index = Array.from(parent.children).indexOf(element) + 1
    return `${generateCssSelector(parent)} > ${selector}:nth-child(${index})`
  }

  return selector
}

/**
 * Get selector suggestions for a given element, using minimized XPath.
 */
export const getSelectorSuggestions = (element: HTMLElement): { xpath: string; css: string } => {
  return {
    xpath: minimizeXPath(element),
    css: generateCssSelector(element),
  }
}
