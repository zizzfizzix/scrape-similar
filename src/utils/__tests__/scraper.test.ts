// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  evaluateXPath,
  evaluateXPathValues,
  extractData,
  generateXPath,
  guessScrapeConfigForElement,
  minimizeXPath,
  scrapePage,
} from '@/utils/scraper'
import type { ColumnDefinition, ScrapeConfig } from '@/utils/types'
import log from 'loglevel'

const malformedXPath = '//*['

// Reset the DOM between tests to ensure isolation
beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  // Clean up in case a test added global properties
  document.body.innerHTML = ''
})

describe('evaluateXPathValues', () => {
  it('returns matching elements when selector targets nodes', () => {
    document.body.innerHTML = `
      <div>
        <span class="hello" data-id="1">Hello</span>
        <span class="hello" data-id="2">World</span>
      </div>
    `

    const result = evaluateXPathValues('//span')
    expect(result).toHaveLength(2)
    result.forEach((node) => expect(node).toBeInstanceOf(HTMLElement))
  })

  it('returns attribute values when selector targets attributes', () => {
    document.body.innerHTML = `
      <div>
        <span class="hello" data-id="1">Hello</span>
        <span class="hello" data-id="2">World</span>
      </div>
    `

    const attrValues = evaluateXPathValues('//span/@data-id')
    expect(attrValues).toEqual(['1', '2'])
  })

  it('returns text node values when querying for text()', () => {
    document.body.innerHTML = `<div>Hello</div>`

    const values = evaluateXPathValues('//div/text()')
    expect(values).toEqual(['Hello'])
  })

  it('supports providing a different context node', () => {
    document.body.innerHTML = `
      <section>
        <span class="scoped">A</span>
      </section>
      <span class="scoped">B</span>
    `
    const section = document.querySelector('section') as HTMLElement

    // Query inside <section> only
    const scopedValues = evaluateXPathValues('.//span', section)
    expect(scopedValues).toHaveLength(1)
    expect((scopedValues[0] as HTMLElement).textContent).toBe('A')
  })

  it('returns an empty array for invalid XPath expressions', () => {
    document.body.innerHTML = `<div></div>`

    // Intentionally malformed XPath
    const result = evaluateXPathValues(malformedXPath)
    expect(result).toEqual([])
  })
})

describe('extractData', () => {
  it('extracts text content with the "." selector', () => {
    document.body.innerHTML = `<span id="target">Example Text</span>`
    const element = document.getElementById('target') as HTMLElement

    const column: ColumnDefinition = { name: 'Text', selector: '.' }
    expect(extractData(element, column)).toBe('Example Text')
  })

  it('extracts attribute values with the "@" selector', () => {
    document.body.innerHTML = `<span id="target" data-info="42">Example</span>`
    const element = document.getElementById('target') as HTMLElement

    const column: ColumnDefinition = { name: 'DataInfo', selector: '@data-info' }
    expect(extractData(element, column)).toBe('42')
  })

  it('supports XPath string functions (e.g., string(@title))', () => {
    document.body.innerHTML = `<span id="target" title="Greeting">Hi</span>`
    const element = document.getElementById('target') as HTMLElement

    const column: ColumnDefinition = { name: 'Title', selector: 'string(@title)' }
    expect(extractData(element, column)).toBe('Greeting')
  })

  it('returns an empty string when selector matches nothing', () => {
    document.body.innerHTML = `<div id="root"></div>`
    const root = document.getElementById('root') as HTMLElement

    const col: ColumnDefinition = { name: 'Missing', selector: 'span' }
    expect(extractData(root, col)).toBe('')
  })

  it('returns text of the first matched element when selector yields multiple nodes', () => {
    document.body.innerHTML = `
      <div id="root">
        <span class="val">A</span>
        <span class="val">B</span>
      </div>
    `
    const root = document.getElementById('root') as HTMLElement
    const col: ColumnDefinition = { name: 'FirstVal', selector: './/span' }
    expect(extractData(root, col)).toBe('A')
  })
})

describe('evaluateXPath', () => {
  it('returns elements matching the XPath query', () => {
    document.body.innerHTML = `
      <div>
        <span class="item">One</span>
        <span class="item">Two</span>
      </div>
    `

    const matches = evaluateXPath('//span')
    expect(matches).toHaveLength(2)
    matches.forEach((node) => expect(node).toBeInstanceOf(HTMLElement))
  })

  it('returns elements only within the provided context node', () => {
    document.body.innerHTML = `
      <section>
        <span class="item">Inside</span>
      </section>
      <span class="item">Outside</span>
    `
    const matchesGlobal = evaluateXPath('//span')
    expect(matchesGlobal).toHaveLength(2)

    const section = document.querySelector('section') as HTMLElement
    const matchesScoped = evaluateXPath('.//span', section)
    expect(matchesScoped).toHaveLength(1)
    expect(matchesScoped[0].textContent).toBe('Inside')
  })

  it('includes positional index when multiple siblings share the same tag', () => {
    document.body.innerHTML = `
      <ul>
        <li>One</li>
        <li id="second">Two</li>
        <li>Three</li>
      </ul>
    `
    const target = document.getElementById('second') as HTMLElement
    const xp = generateXPath(target)

    // Expect path to contain [2] indicating second sibling
    expect(xp).toMatch(/\[2\]/)

    const selection = evaluateXPath(xp)
    expect(selection).toHaveLength(1)
    expect(selection[0]).toBe(target)
  })
})

describe('generateXPath & minimizeXPath', () => {
  it('generates a valid XPath for an element and then generalizes it to capture similar elements', () => {
    document.body.innerHTML = `
      <div>
        <ul>
          <li id="first">One</li>
          <li>Two</li>
        </ul>
      </div>
    `

    const target = document.getElementById('first') as HTMLElement

    const fullXPath = generateXPath(target)
    const elementsFromFull = evaluateXPath(fullXPath)
    expect(elementsFromFull).toHaveLength(1)
    expect(elementsFromFull[0]).toBe(target)

    const minimized = minimizeXPath(target)
    const elementsFromMin = evaluateXPath(minimized)
    expect(elementsFromMin).toHaveLength(2)
    expect(elementsFromMin[0]).toBe(target)
    expect(elementsFromMin[1]).toBeInstanceOf(HTMLElement)
  })

  it('returns /html/body when called with document.body', () => {
    const bodyXPath = generateXPath(document.body)
    expect(bodyXPath).toBe('/html/body')
  })
})

describe('scrapePage', () => {
  it('scrapes data according to the provided configuration and preserves metadata', () => {
    document.body.innerHTML = `
      <ul>
        <li class="item" data-id="1">First</li>
        <li class="item" data-id="2">Second</li>
        <li class="item" data-id="">   </li>
      </ul>
    `

    const config: ScrapeConfig = {
      mainSelector: "//li[@class='item']",
      columns: [
        { name: 'Text', key: 'text', selector: '.' },
        { name: 'ID', key: 'id', selector: '@data-id' },
      ],
    }

    const result = scrapePage(config)

    // Expect all three <li> elements to be represented
    expect(result).toHaveLength(3)

    // Row 0 assertions
    expect(result[0].data).toEqual({ text: 'First', id: '1' })
    expect(result[0].metadata.originalIndex).toBe(0)
    expect(result[0].metadata.isEmpty).toBe(false)

    // Row 1 assertions
    expect(result[1].data).toEqual({ text: 'Second', id: '2' })
    expect(result[1].metadata.originalIndex).toBe(1)
    expect(result[1].metadata.isEmpty).toBe(false)

    // Row 2 should be flagged as empty
    expect(result[2].data).toEqual({ text: '', id: '' })
    expect(result[2].metadata.originalIndex).toBe(2)
    expect(result[2].metadata.isEmpty).toBe(true)
  })

  it('correctly determines isEmpty when only some columns are blank', () => {
    document.body.innerHTML = `
      <ul>
        <li class="item" data-id="3">   </li>
        <li class="item" data-id="4">Value</li>
      </ul>
    `

    const config: ScrapeConfig = {
      mainSelector: "//li[@class='item']",
      columns: [
        { name: 'Text', key: 'text', selector: '.' },
        { name: 'ID', key: 'id', selector: '@data-id' },
      ],
    }

    const rows = scrapePage(config)

    // First row: text empty but id has value => not empty
    expect(rows[0].data).toEqual({ text: '', id: '3' })
    expect(rows[0].metadata.isEmpty).toBe(false)

    // Second row: all good
    expect(rows[1].data).toEqual({ text: 'Value', id: '4' })
    expect(rows[1].metadata.isEmpty).toBe(false)
  })

  it('returns an empty array when mainSelector matches zero elements', () => {
    document.body.innerHTML = `<p>No list items here</p>`
    const config: ScrapeConfig = {
      mainSelector: "//li[@class='nonexistent']",
      columns: [{ name: 'Text', selector: '.' }],
    }
    expect(scrapePage(config)).toEqual([])
  })
})

describe('guessScrapeConfigForElement', () => {
  it('generates sensible config for an anchor element', () => {
    document.body.innerHTML = `<a href="https://example.com" id="link">Click me</a>`
    const link = document.getElementById('link') as HTMLElement

    const cfg = guessScrapeConfigForElement(link)

    // Ensure mainSelector uniquely selects the anchor
    const nodes = evaluateXPath(cfg.mainSelector)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toBe(link)

    const selectors = cfg.columns.map((c) => c.selector)
    expect(selectors).toContain('.')
    expect(selectors).toContain('@href')
  })

  it('creates column definitions based on table headers', () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Name</th><th>Age</th></tr>
        </thead>
        <tbody>
          <tr id="row"><td>John</td><td>30</td></tr>
          <tr id="row2"><td>Jane</td><td>25</td></tr>
        </tbody>
      </table>
    `
    const row = document.getElementById('row') as HTMLElement
    const config = guessScrapeConfigForElement(row)

    // Should have two columns matching headers
    expect(config.columns).toHaveLength(2)
    expect(config.columns[0].name).toBe('Name')
    expect(config.columns[0].selector).toBe('*[1]')
    expect(config.columns[1].name).toBe('Age')
    expect(config.columns[1].selector).toBe('*[2]')

    // Main selector should match data rows (tr elements with td)
    const matchedRows = evaluateXPath(config.mainSelector)
    expect(matchedRows).toHaveLength(2)
    expect(matchedRows[0]).toBe(row)
    expect(matchedRows[1]).not.toBe(row)
  })
})

describe('scraper error handling', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('evaluateXPathValues logs error and returns empty array on invalid XPath', () => {
    const res = evaluateXPathValues(malformedXPath)
    expect(res).toEqual([])
    expect(logSpy).toHaveBeenCalled()
  })

  it('evaluateXPath throws error on invalid XPath', () => {
    expect(() => evaluateXPath(malformedXPath)).toThrow()
  })

  it('extractData logs error and returns empty string when selector invalid', () => {
    document.body.innerHTML = `<div id="root"></div>`
    const root = document.getElementById('root') as HTMLElement
    const col: ColumnDefinition = { name: 'Invalid', selector: malformedXPath }
    const val = extractData(root, col)
    expect(val).toBe('')
    expect(logSpy).toHaveBeenCalled()
  })

  it('scrapePage logs error and returns empty array when mainSelector invalid', () => {
    const cfg: ScrapeConfig = {
      mainSelector: malformedXPath,
      columns: [{ name: 'Text', selector: '.' }],
    }
    const res = scrapePage(cfg)
    expect(res).toEqual([])
    expect(logSpy).toHaveBeenCalled()
  })

  it('generateXPath returns empty string when node invalid', () => {
    // @ts-expect-error - passing null intentionally
    expect(generateXPath(null)).toBe('')
  })
})
