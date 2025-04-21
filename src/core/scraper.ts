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
    console.error('Error evaluating XPath:', error)
  }
  return results
}

/**
 * Extract data from an element using a column definition (supports attribute/text XPath).
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

    // Otherwise, find child elements or values and extract from the first match
    if (language === 'xpath') {
      const values = evaluateXPathValues(selector, element)
      if (values.length > 0) {
        // If it's an element, return its textContent; otherwise, return the string value
        const first = values[0]
        if (typeof first === 'string') return first.trim()
        if (first instanceof HTMLElement) return first.textContent?.trim() || ''
      }
      return ''
    } else {
      const childElements = Array.from(element.querySelectorAll(selector)) as HTMLElement[]
      if (childElements.length > 0) {
        return childElements[0].textContent?.trim() || ''
      }
      return ''
    }
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

/**
 * Guess a ScrapeConfig for a given element, inspired by bit155 logic but modernized.
 * Handles tables, links, images, lists, and default cases.
 */
export const guessScrapeConfigForElement = (element: HTMLElement): ScrapeConfig => {
  let ancestor: HTMLElement =
    (element.closest(
      'tr, a, img, dt, li, button, input, textarea, select, h1, h2, h3, h4, h5, h6, article, section, main, aside, figure',
    ) as HTMLElement) || element
  let tagName = ancestor.tagName.toLowerCase()
  let language: SelectorLanguage = 'xpath'
  let mainSelector = minimizeXPath(ancestor)
  let columns: ColumnDefinition[] = []

  const getText = (el: Element) => el.textContent?.trim() || ''
  const getDataAttributes = (el: Element) =>
    Array.from(el.attributes)
      .filter((attr) => attr.name.startsWith('data-'))
      .map((attr) => ({
        name: attr.name,
        selector: `@${attr.name}`,
        language: 'xpath' as const,
      }))

  switch (tagName) {
    case 'tr': {
      const table = ancestor.closest('table')
      const ths = table ? Array.from(table.querySelectorAll('th')) : []
      const tds = Array.from(ancestor.children)
      if (ths.length === tds.length) {
        columns = ths.map((th, i) => ({
          name: getText(th) || `Column ${i + 1}`,
          selector: `*[${i + 1}]`,
          language: 'xpath' as const,
        }))
      } else {
        columns = tds.map((_, i) => ({
          name: `Column ${i + 1}`,
          selector: `*[${i + 1}]`,
          language: 'xpath' as const,
        }))
      }
      mainSelector += '[td]'
      break
    }
    case 'a':
      columns = [
        { name: 'Anchor text', selector: '.', language: 'xpath' as const },
        { name: 'URL', selector: '@href', language: 'xpath' as const },
        { name: 'Rel', selector: '@rel', language: 'xpath' as const },
        { name: 'Target', selector: '@target', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'img':
      columns = [
        { name: 'Alt Text', selector: '@alt', language: 'xpath' as const },
        { name: 'Source', selector: '@src', language: 'xpath' as const },
        { name: 'Title', selector: '@title', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'button':
      columns = [
        { name: 'Text', selector: '.', language: 'xpath' as const },
        { name: 'Value', selector: '@value', language: 'xpath' as const },
        { name: 'ARIA Label', selector: '@aria-label', language: 'xpath' as const },
        { name: 'Disabled', selector: '@disabled', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'input': {
      const type = ancestor.getAttribute('type') || ''
      columns = [
        { name: 'Value', selector: '@value', language: 'xpath' as const },
        { name: 'Placeholder', selector: '@placeholder', language: 'xpath' as const },
        { name: 'Name', selector: '@name', language: 'xpath' as const },
        { name: 'Type', selector: '@type', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      if (type === 'checkbox' || type === 'radio') {
        columns.push({ name: 'Checked', selector: '@checked', language: 'xpath' as const })
      }
      break
    }
    case 'textarea':
      columns = [
        { name: 'Value', selector: '.', language: 'xpath' as const },
        { name: 'Placeholder', selector: '@placeholder', language: 'xpath' as const },
        { name: 'Name', selector: '@name', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'select':
      columns = [
        { name: 'Selected Option', selector: 'option[@selected]', language: 'xpath' as const },
        { name: 'Name', selector: '@name', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'dt':
      columns = [
        { name: 'Term', selector: '.', language: 'xpath' as const },
        { name: 'Definition', selector: './following-sibling::dd', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'li':
      columns = [
        { name: 'List Item', selector: '.', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      columns = [
        { name: 'Heading', selector: '.', language: 'xpath' as const },
        { name: 'ARIA Label', selector: '@aria-label', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'article':
    case 'section':
    case 'main':
    case 'aside':
      columns = [
        { name: 'Text', selector: '.', language: 'xpath' as const },
        { name: 'ARIA Label', selector: '@aria-label', language: 'xpath' as const },
      ]
      // Try to find the first heading inside
      const heading = ancestor.querySelector('h1,h2,h3,h4,h5,h6')
      if (heading) {
        columns.push({
          name: 'Headline',
          selector: heading.tagName.toLowerCase(),
          language: 'xpath' as const,
        })
      }
      columns.push(...getDataAttributes(ancestor))
      break
    case 'figure':
      columns = [
        { name: 'Image Source', selector: './/img/@src', language: 'xpath' as const },
        { name: 'Image Alt', selector: './/img/@alt', language: 'xpath' as const },
        { name: 'Image Title', selector: './/img/@title', language: 'xpath' as const },
        { name: 'Caption', selector: 'figcaption', language: 'xpath' as const },
        { name: 'Code', selector: 'pre|code', language: 'xpath' as const },
        { name: 'Blockquote', selector: 'blockquote', language: 'xpath' as const },
        { name: 'Paragraph', selector: 'p', language: 'xpath' as const },
        { name: 'Figure Text', selector: '.', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'blockquote':
      columns = [
        { name: 'Quote', selector: '.', language: 'xpath' as const },
        { name: 'Citation', selector: '@cite', language: 'xpath' as const },
        { name: 'Footer', selector: 'footer', language: 'xpath' as const },
        { name: 'Cite Element', selector: 'cite', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'pre':
    case 'code':
      columns = [
        { name: 'Code', selector: '.', language: 'xpath' as const },
        { name: 'Language', selector: '@data-language', language: 'xpath' as const },
        { name: 'Class', selector: '@class', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      // If parent is figure, add figcaption
      if (ancestor.parentElement?.tagName.toLowerCase() === 'figure') {
        columns.push({ name: 'Caption', selector: 'figcaption', language: 'xpath' as const })
      }
      break
    case 'colgroup':
      columns = [
        { name: 'Span', selector: '@span', language: 'xpath' as const },
        { name: 'Class', selector: '@class', language: 'xpath' as const },
        { name: 'Style', selector: '@style', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'col':
      columns = [
        { name: 'Span', selector: '@span', language: 'xpath' as const },
        { name: 'Class', selector: '@class', language: 'xpath' as const },
        { name: 'Style', selector: '@style', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'table': {
      const caption = ancestor.querySelector('caption')
      const ths = Array.from(ancestor.querySelectorAll('th'))
      const cols = Array.from(ancestor.querySelectorAll('col'))
      columns = [
        ...(caption ? [{ name: 'Caption', selector: 'caption', language: 'xpath' as const }] : []),
        ...ths.map((th, i) => ({
          name: getText(th) || `Column ${i + 1}`,
          selector: `.//tr/td[${i + 1}]`,
          language: 'xpath' as const,
        })),
        { name: 'Col Count', selector: 'count(col)', language: 'xpath' as const },
        ...cols.map((col, i) => ({
          name: `Col ${i + 1} Span`,
          selector: `.//col[${i + 1}]/@span`,
          language: 'xpath' as const,
        })),
        ...getDataAttributes(ancestor),
      ]
      break
    }
    case 'ul':
    case 'ol':
      columns = [
        { name: 'List Item', selector: 'li', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'dl':
      columns = [
        { name: 'Term', selector: 'dt', language: 'xpath' as const },
        { name: 'Definition', selector: 'dd', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'form':
      columns = [
        { name: 'Action', selector: '@action', language: 'xpath' as const },
        { name: 'Method', selector: '@method', language: 'xpath' as const },
        { name: 'Input Names', selector: './/input/@name', language: 'xpath' as const },
        { name: 'Input Types', selector: './/input/@type', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'nav':
      columns = [
        { name: 'Text', selector: '.', language: 'xpath' as const },
        { name: 'ARIA Label', selector: '@aria-label', language: 'xpath' as const },
        { name: 'Links', selector: 'a/@href', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'header':
    case 'footer':
      columns = [
        { name: 'Text', selector: '.', language: 'xpath' as const },
        { name: 'ARIA Label', selector: '@aria-label', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'video':
    case 'audio':
      columns = [
        { name: 'Source', selector: 'source/@src', language: 'xpath' as const },
        { name: 'Poster', selector: '@poster', language: 'xpath' as const },
        { name: 'Controls', selector: '@controls', language: 'xpath' as const },
        { name: 'Captions', selector: 'track/@src', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'details':
      columns = [
        { name: 'Summary', selector: 'summary', language: 'xpath' as const },
        { name: 'Details', selector: '.', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'summary':
      columns = [
        { name: 'Summary', selector: '.', language: 'xpath' as const },
        ...getDataAttributes(ancestor),
      ]
      break
    default:
      if (ancestor.hasAttribute('aria-label')) {
        columns.push({
          name: 'ARIA Label',
          selector: '@aria-label',
          language: 'xpath' as const,
        })
      }
      columns.push({ name: 'Text', selector: '.', language: 'xpath' as const })
      columns.push(...getDataAttributes(ancestor))
      break
  }

  return {
    mainSelector,
    language,
    columns,
  }
}
