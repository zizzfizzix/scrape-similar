import log from 'loglevel'
import { ColumnDefinition, ScrapeConfig, ScrapedData, ScrapedRow } from './types'

/**
 * Scrape data from the page based on the provided configuration
 */
export const scrapePage = (config: ScrapeConfig): ScrapedData => {
  try {
    const { mainSelector, columns } = config
    const results: ScrapedRow[] = []

    // Find all primary elements using the main selector
    const primaryElements = evaluateXPath(mainSelector)

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
    if (selector.startsWith('@')) {
      const attributeName = selector.substring(1)
      return element.getAttribute(attributeName) || ''
    }

    const values = evaluateXPathValues(selector, element)
    if (values.length > 0) {
      // If it's an element, return its textContent; otherwise, return the string value
      const first = values[0]
      if (typeof first === 'string') return first.trim()
      if (first instanceof HTMLElement) return first.textContent?.trim() || ''
    }
    return ''
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
 * Guess a ScrapeConfig for a given element, inspired by bit155 logic but modernized.
 * Handles tables, links, images, lists, and default cases.
 */
export const guessScrapeConfigForElement = (element: HTMLElement): ScrapeConfig => {
  let ancestor: HTMLElement =
    (element.closest(
      'tr, a, img, dt, li, button, input, textarea, select, h1, h2, h3, h4, h5, h6, article, section, main, aside, figure',
    ) as HTMLElement) || element
  let tagName = ancestor.tagName.toLowerCase()
  let mainSelector = minimizeXPath(ancestor)
  let columns: ColumnDefinition[] = []

  const getText = (el: Element) => el.textContent?.trim() || ''
  const getDataAttributes = (el: Element) =>
    Array.from(el.attributes)
      .filter((attr) => attr.name.startsWith('data-'))
      .map((attr) => ({
        name: attr.name,
        selector: `@${attr.name}`,
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
        }))
      } else {
        columns = tds.map((_, i) => ({
          name: `Column ${i + 1}`,
          selector: `*[${i + 1}]`,
        }))
      }
      mainSelector += '[td]'
      break
    }
    case 'a':
      columns = [
        { name: 'Anchor text', selector: '.' },
        { name: 'URL', selector: '@href' },
        { name: 'Rel', selector: '@rel' },
        { name: 'Target', selector: '@target' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'img':
      columns = [
        { name: 'Alt Text', selector: '@alt' },
        { name: 'Source', selector: '@src' },
        { name: 'Title', selector: '@title' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'button':
      columns = [
        { name: 'Text', selector: '.' },
        { name: 'Value', selector: '@value' },
        { name: 'ARIA Label', selector: '@aria-label' },
        { name: 'Disabled', selector: '@disabled' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'input': {
      const type = ancestor.getAttribute('type') || ''
      columns = [
        { name: 'Value', selector: '@value' },
        { name: 'Placeholder', selector: '@placeholder' },
        { name: 'Name', selector: '@name' },
        { name: 'Type', selector: '@type' },
        ...getDataAttributes(ancestor),
      ]
      if (type === 'checkbox' || type === 'radio') {
        columns.push({ name: 'Checked', selector: '@checked' })
      }
      break
    }
    case 'textarea':
      columns = [
        { name: 'Value', selector: '.' },
        { name: 'Placeholder', selector: '@placeholder' },
        { name: 'Name', selector: '@name' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'select':
      columns = [
        { name: 'Selected Option', selector: 'option[@selected]' },
        { name: 'Name', selector: '@name' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'dt':
      columns = [
        { name: 'Term', selector: '.' },
        { name: 'Definition', selector: './following-sibling::dd' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'li':
      columns = [{ name: 'List Item', selector: '.' }, ...getDataAttributes(ancestor)]
      break
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      columns = [
        { name: 'Heading', selector: '.' },
        { name: 'ARIA Label', selector: '@aria-label' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'article':
    case 'section':
    case 'main':
    case 'aside':
      columns = [
        { name: 'Text', selector: '.' },
        { name: 'ARIA Label', selector: '@aria-label' },
      ]
      // Try to find the first heading inside
      const heading = ancestor.querySelector('h1,h2,h3,h4,h5,h6')
      if (heading) {
        columns.push({
          name: 'Headline',
          selector: heading.tagName.toLowerCase(),
        })
      }
      columns.push(...getDataAttributes(ancestor))
      break
    case 'figure':
      columns = [
        { name: 'Image Source', selector: './/img/@src' },
        { name: 'Image Alt', selector: './/img/@alt' },
        { name: 'Image Title', selector: './/img/@title' },
        { name: 'Caption', selector: 'figcaption' },
        { name: 'Code', selector: 'pre|code' },
        { name: 'Blockquote', selector: 'blockquote' },
        { name: 'Paragraph', selector: 'p' },
        { name: 'Figure Text', selector: '.' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'blockquote':
      columns = [
        { name: 'Quote', selector: '.' },
        { name: 'Citation', selector: '@cite' },
        { name: 'Footer', selector: 'footer' },
        { name: 'Cite Element', selector: 'cite' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'pre':
    case 'code':
      columns = [
        { name: 'Code', selector: '.' },
        { name: 'Language', selector: '@data-language' },
        { name: 'Class', selector: '@class' },
        ...getDataAttributes(ancestor),
      ]
      // If parent is figure, add figcaption
      if (ancestor.parentElement?.tagName.toLowerCase() === 'figure') {
        columns.push({ name: 'Caption', selector: 'figcaption' })
      }
      break
    case 'colgroup':
      columns = [
        { name: 'Span', selector: '@span' },
        { name: 'Class', selector: '@class' },
        { name: 'Style', selector: '@style' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'col':
      columns = [
        { name: 'Span', selector: '@span' },
        { name: 'Class', selector: '@class' },
        { name: 'Style', selector: '@style' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'table': {
      const caption = ancestor.querySelector('caption')
      const ths = Array.from(ancestor.querySelectorAll('th'))
      const cols = Array.from(ancestor.querySelectorAll('col'))
      columns = [
        ...(caption ? [{ name: 'Caption', selector: 'caption' }] : []),
        ...ths.map((th, i) => ({
          name: getText(th) || `Column ${i + 1}`,
          selector: `.//tr/td[${i + 1}]`,
        })),
        { name: 'Col Count', selector: 'count(col)' },
        ...cols.map((col, i) => ({
          name: `Col ${i + 1} Span`,
          selector: `.//col[${i + 1}]/@span`,
        })),
        ...getDataAttributes(ancestor),
      ]
      break
    }
    case 'ul':
    case 'ol':
      columns = [{ name: 'List Item', selector: 'li' }, ...getDataAttributes(ancestor)]
      break
    case 'dl':
      columns = [
        { name: 'Term', selector: 'dt' },
        { name: 'Definition', selector: 'dd' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'form':
      columns = [
        { name: 'Action', selector: '@action' },
        { name: 'Method', selector: '@method' },
        { name: 'Input Names', selector: './/input/@name' },
        { name: 'Input Types', selector: './/input/@type' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'nav':
      columns = [
        { name: 'Text', selector: '.' },
        { name: 'ARIA Label', selector: '@aria-label' },
        { name: 'Links', selector: 'a/@href' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'header':
    case 'footer':
      columns = [
        { name: 'Text', selector: '.' },
        { name: 'ARIA Label', selector: '@aria-label' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'video':
    case 'audio':
      columns = [
        { name: 'Source', selector: 'source/@src' },
        { name: 'Poster', selector: '@poster' },
        { name: 'Controls', selector: '@controls' },
        { name: 'Captions', selector: 'track/@src' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'details':
      columns = [
        { name: 'Summary', selector: 'summary' },
        { name: 'Details', selector: '.' },
        ...getDataAttributes(ancestor),
      ]
      break
    case 'summary':
      columns = [{ name: 'Summary', selector: '.' }, ...getDataAttributes(ancestor)]
      break
    default:
      if (ancestor.hasAttribute('aria-label')) {
        columns.push({
          name: 'ARIA Label',
          selector: '@aria-label',
        })
      }
      columns.push({ name: 'Text', selector: '.' })
      columns.push(...getDataAttributes(ancestor))
      break
  }

  return {
    mainSelector,
    columns,
  }
}
