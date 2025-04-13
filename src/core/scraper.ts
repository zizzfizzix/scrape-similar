import { ColumnDefinition, ScrapedData, ScrapedRow, ScrapeConfig, SelectorLanguage } from './types'

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
 * Generate XPath for a node, considering its position among siblings
 */
export const generateXPath = (node: Node): string => {
  if (!node || !node.parentNode) {
    return ''
  }

  if (node === document.body) {
    return '/html/body'
  }

  // Get position among siblings of same type
  let position = 1
  let sibling = node.previousSibling

  while (sibling) {
    if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === node.nodeName) {
      position++
    }
    sibling = sibling.previousSibling
  }

  return `${generateXPath(node.parentNode)}/${node.nodeName.toLowerCase()}[${position}]`
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
 * Get selector suggestions for a given element
 */
export const getSelectorSuggestions = (element: HTMLElement): { xpath: string; css: string } => {
  return {
    xpath: generateXPath(element),
    css: generateCssSelector(element),
  }
}
