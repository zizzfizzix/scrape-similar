// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
  type MockInstance,
} from 'vitest'

import {
  countXPathMatches,
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
    const section = document.querySelector('section')!

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
    const element = document.getElementById('target')!

    const column: ColumnDefinition = { name: 'Text', selector: '.' }
    expect(extractData(element, column)).toBe('Example Text')
  })

  it('extracts attribute values with the "@" selector', () => {
    document.body.innerHTML = `<span id="target" data-info="42">Example</span>`
    const element = document.getElementById('target')!

    const column: ColumnDefinition = { name: 'DataInfo', selector: '@data-info' }
    expect(extractData(element, column)).toBe('42')
  })

  it('supports XPath string functions (e.g., string(@title))', () => {
    document.body.innerHTML = `<span id="target" title="Greeting">Hi</span>`
    const element = document.getElementById('target')!

    const column: ColumnDefinition = { name: 'Title', selector: 'string(@title)' }
    expect(extractData(element, column)).toBe('Greeting')
  })

  it('returns an empty string when selector matches nothing', () => {
    document.body.innerHTML = `<div id="root"></div>`
    const root = document.getElementById('root')!

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
    const root = document.getElementById('root')!
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

    const section = document.querySelector('section')!
    const matchesScoped = evaluateXPath('.//span', section)
    expect(matchesScoped).toHaveLength(1)
    expect(matchesScoped[0]?.textContent).toBe('Inside')
  })

  it('includes positional index when multiple siblings share the same tag', () => {
    document.body.innerHTML = `
      <ul>
        <li>One</li>
        <li id="second">Two</li>
        <li>Three</li>
      </ul>
    `
    const target = document.getElementById('second')!
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

    const target = document.getElementById('first')!

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

  // The sibling div gives each target's path a positional step.
  it.each([
    ['h1', '<h1 id="x">Title</h1>'],
    ['tr', '<table><tr id="x"><td>only</td></tr></table>'],
    ['li', '<ul><li id="x">only</li></ul>'],
    ['td', '<table><tr><td id="x">only</td></tr></table>'],
  ])('minimizes a unique %s behind a positional ancestor to a path matching it', (_tag, html) => {
    document.body.innerHTML = `<div></div><div>${html}</div>`
    const target = document.getElementById('x')!

    expect(evaluateXPath(minimizeXPath(target))).toEqual([target])
  })

  // A guard for shapes other than the cases above: nothing on this page is unique behind a positional step.
  it('minimizes every element of the scrape-target fixture to a path that matches it', () => {
    const fixture = readFileSync(
      join(import.meta.dirname, '../../../tests/e2e/fixtures/pages/scrape-target.html'),
      'utf8',
    )
    const originalPage = document.documentElement.innerHTML
    onTestFinished(() => {
      document.documentElement.innerHTML = originalPage
    })
    document.documentElement.innerHTML = new DOMParser().parseFromString(
      fixture,
      'text/html',
    ).documentElement.innerHTML

    const elements = Array.from(document.querySelectorAll('*'))
    expect(elements.length).toBeGreaterThan(50)
    for (const element of elements) expect(evaluateXPath(minimizeXPath(element))).toContain(element)
  })

  it('returns /html/body when called with document.body', () => {
    const bodyXPath = generateXPath(document.body)
    expect(bodyXPath).toBe('/html/body')
  })

  it('stops at the document for an element outside the body', () => {
    expect(generateXPath(document.documentElement)).toBe('/html')
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
    expect(result[0]?.data).toEqual({ text: 'First', id: '1' })
    expect(result[0]?.metadata.originalIndex).toBe(0)
    expect(result[0]?.metadata.isEmpty).toBe(false)

    // Row 1 assertions
    expect(result[1]?.data).toEqual({ text: 'Second', id: '2' })
    expect(result[1]?.metadata.originalIndex).toBe(1)
    expect(result[1]?.metadata.isEmpty).toBe(false)

    // Row 2 should be flagged as empty
    expect(result[2]?.data).toEqual({ text: '', id: '' })
    expect(result[2]?.metadata.originalIndex).toBe(2)
    expect(result[2]?.metadata.isEmpty).toBe(true)
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
    expect(rows[0]?.data).toEqual({ text: '', id: '3' })
    expect(rows[0]?.metadata.isEmpty).toBe(false)

    // Second row: all good
    expect(rows[1]?.data).toEqual({ text: 'Value', id: '4' })
    expect(rows[1]?.metadata.isEmpty).toBe(false)
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
    const link = document.getElementById('link')!

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
    const row = document.getElementById('row')!
    const config = guessScrapeConfigForElement(row)

    // Should have two columns matching headers
    expect(config.columns).toHaveLength(2)
    expect(config.columns[0]?.name).toBe('Name')
    expect(config.columns[0]?.selector).toBe('*[1]')
    expect(config.columns[1]?.name).toBe('Age')
    expect(config.columns[1]?.selector).toBe('*[2]')

    // Main selector should match data rows (tr elements with td)
    const matchedRows = evaluateXPath(config.mainSelector)
    expect(matchedRows).toHaveLength(2)
    expect(matchedRows[0]).toBe(row)
    expect(matchedRows[1]).not.toBe(row)
  })

  it('scrapes only the outer rows of a nested layout table', () => {
    document.body.innerHTML = `
      <table>
        <tr><td id="o">outer 1<table><tr><td>inner 1</td></tr><tr><td>inner 2</td></tr></table></td></tr>
        <tr><td>outer 2</td></tr>
      </table>
    `
    const config = guessScrapeConfigForElement(document.getElementById('o')!)

    const rows = scrapePage(config)
    expect(rows.map((row) => row.data)).toEqual([
      { col1: 'outer 1inner 1inner 2' },
      { col1: 'outer 2' },
    ])
  })

  it('uses the last header row when thead holds several', () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th colspan="2">Grouped heading</th></tr>
          <tr><th>Name</th><th>Age</th></tr>
        </thead>
        <tbody>
          <tr id="row"><td>John</td><td>30</td></tr>
          <tr id="row2"><td>Jane</td><td>25</td></tr>
        </tbody>
      </table>
    `
    const row = document.getElementById('row')!
    const config = guessScrapeConfigForElement(row)

    expect(config.columns).toHaveLength(2)
    expect(config.columns[0]?.name).toBe('Name')
    expect(config.columns[1]?.name).toBe('Age')
  })

  it('prefers repeated row ancestors (tr with sibling trs)', () => {
    document.body.innerHTML = `
      <div id="container">
        <table>
          <tbody>
            <tr id="row1"><td><span id="target">Cell 1</span></td></tr>
            <tr id="row2"><td><span>Cell 2</span></td></tr>
            <tr id="row3"><td><span>Cell 3</span></td></tr>
          </tbody>
        </table>
      </div>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should select the tr ancestor, not the span
    const matchedElements = evaluateXPath(config.mainSelector)
    expect(matchedElements.length).toBeGreaterThanOrEqual(3)
    expect(matchedElements[0]?.tagName.toLowerCase()).toBe('tr')
  })

  it('prefers li elements with sibling lis', () => {
    document.body.innerHTML = `
      <ul id="list">
        <li id="item1"><span id="target">Item 1</span></li>
        <li id="item2"><span>Item 2</span></li>
        <li id="item3"><span>Item 3</span></li>
      </ul>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should select the li ancestor, not the span
    const matchedElements = evaluateXPath(config.mainSelector)
    expect(matchedElements.length).toBeGreaterThanOrEqual(3)
    expect(matchedElements[0]?.tagName.toLowerCase()).toBe('li')
  })

  it('prefers dt/dd elements with siblings', () => {
    document.body.innerHTML = `
      <dl>
        <dt id="term1"><span id="target">Term 1</span></dt>
        <dd>Description 1</dd>
        <dt id="term2"><span>Term 2</span></dt>
        <dd>Description 2</dd>
      </dl>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should select the dt ancestor, not the span
    const matchedElements = evaluateXPath(config.mainSelector)
    expect(matchedElements.length).toBeGreaterThanOrEqual(2)
    expect(matchedElements[0]?.tagName.toLowerCase()).toBe('dt')
  })

  it('finds nearest repeating node by walking up DOM tree', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <div class="item" id="item1">
          <div class="inner">
            <span id="target">Text 1</span>
          </div>
        </div>
        <div class="item" id="item2">
          <div class="inner">
            <span>Text 2</span>
          </div>
        </div>
        <div class="item" id="item3">
          <div class="inner">
            <span>Text 3</span>
          </div>
        </div>
      </div>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should select the repeating div.item ancestors
    const matchedElements = evaluateXPath(config.mainSelector)
    expect(matchedElements.length).toBeGreaterThanOrEqual(3)
    expect(matchedElements[0]).toHaveProperty('className', 'item')
  })

  it('avoids jumping to broad layout containers with few siblings', () => {
    document.body.innerHTML = `
      <main>
        <section id="section1">
          <div class="card" id="card1">
            <span id="target">Card 1</span>
          </div>
          <div class="card" id="card2">
            <span>Card 2</span>
          </div>
          <div class="card" id="card3">
            <span>Card 3</span>
          </div>
        </section>
        <section id="section2">
          <p>Another section</p>
        </section>
      </main>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should select the repeating div.card elements, not the section
    const matchedElements = evaluateXPath(config.mainSelector)
    expect(matchedElements.length).toBeGreaterThanOrEqual(3)
    // Verify it's selecting the cards, not sections
    const firstMatch = matchedElements[0]!
    expect(firstMatch.className).toBe('card')
  })

  it('falls back to element itself when no repeating ancestors found', () => {
    document.body.innerHTML = `
      <div>
        <span id="target">Unique element</span>
      </div>
    `
    const target = document.getElementById('target')!
    const config = guessScrapeConfigForElement(target)

    // Should work even without repeating structure
    expect(config.mainSelector).toBeTruthy()
    expect(config.columns).toBeTruthy()
    expect(config.columns.length).toBeGreaterThan(0)
  })
})

describe('scraper error handling', () => {
  let logSpy: MockInstance<typeof log.error>

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
    const root = document.getElementById('root')!
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
})

describe('evaluateXPathValues node kinds', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns an empty string for an empty text node', () => {
    const container = document.createElement('div')
    container.append(document.createTextNode(''))
    document.body.append(container)

    expect(evaluateXPathValues('text()', container)).toEqual([''])
  })

  it('ignores node kinds it has no string form for', () => {
    document.body.innerHTML = '<div id="c"><!-- a note --></div>'
    const container = document.querySelector('#c')!

    expect(evaluateXPathValues('comment()', container)).toEqual([])
  })
})

describe('evaluateXPath non-element nodes', () => {
  it('ignores matches that are not elements', () => {
    document.body.innerHTML = '<div id="c">text<span>child</span></div>'
    const container = document.querySelector('#c')!

    expect(evaluateXPath('node()', container)).toEqual([container.querySelector('span')])
  })
})

describe('countXPathMatches', () => {
  beforeEach(() => {
    document.body.innerHTML = '<ul><li>a</li><li>b</li></ul>'
  })

  it('counts the matching nodes', () => {
    expect(countXPathMatches('//li')).toBe(2)
  })

  it('counts within the given context node', () => {
    expect(countXPathMatches('li', document.querySelector('ul')!)).toBe(2)
  })

  it('reports zero for an expression the engine rejects', () => {
    expect(countXPathMatches('//[[invalid')).toBe(0)
  })

  it('reports zero when nothing matches', () => {
    expect(countXPathMatches('//table')).toBe(0)
  })
})

describe('extractData node-evaluation fallback', () => {
  /** Stub document.evaluate so the string result is empty and nodes come from `nodes`. */
  const withNodes = (nodes: Node[]) => {
    vi.spyOn(document, 'evaluate').mockImplementation(((
      _expression: string,
      _context: Node,
      _resolver: unknown,
      resultType: number,
    ) => {
      if (resultType === XPathResult.STRING_TYPE) return { stringValue: '' } as XPathResult
      return {
        snapshotLength: nodes.length,
        snapshotItem: (index: number) => nodes[index] ?? null,
      } as XPathResult
    }) as typeof document.evaluate)
  }

  const element = () => {
    document.body.innerHTML = '<div id="e"></div>'
    return document.querySelector<HTMLElement>('#e')!
  }

  it('returns the trimmed string value of an attribute node', () => {
    const attribute = document.createAttribute('data-x')
    attribute.value = '  attr value  '
    withNodes([attribute])

    expect(extractData(element(), { name: 'X', selector: 'attribute::data-x' })).toBe('attr value')
  })

  it('returns the trimmed text of an element node', () => {
    const host = element()
    const child = document.createElement('span')
    child.textContent = '  child text  '
    withNodes([child])

    expect(extractData(host, { name: 'X', selector: 'span' })).toBe('child text')
  })

  it('returns an empty string for an element with no text', () => {
    const host = element()
    withNodes([document.createElement('span')])

    expect(extractData(host, { name: 'X', selector: 'span' })).toBe('')
  })

  it('returns an empty string when node evaluation finds nothing either', () => {
    const host = element()
    withNodes([])

    expect(extractData(host, { name: 'X', selector: 'span' })).toBe('')
  })
})

describe('extractData with a malformed column', () => {
  it('logs and returns an empty string when the selector is not a string', () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    document.body.innerHTML = '<div id="e">text</div>'
    const host = document.querySelector<HTMLElement>('#e')!

    const result = extractData(host, { name: 'X' } as unknown as ColumnDefinition)

    expect(result).toBe('')
    expect(errorSpy).toHaveBeenCalledWith('Error extracting data:', expect.any(Error))
  })
})

describe('scrapePage empty rows', () => {
  it('flags a row whose every column is blank', () => {
    document.body.innerHTML = '<ul><li><span></span></li></ul>'

    const rows = scrapePage({
      mainSelector: '//li',
      columns: [
        { name: 'A', selector: 'span' },
        { name: 'B', selector: '@data-missing' },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.metadata.isEmpty).toBe(true)
    expect(rows[0]?.data).toEqual({ A: '', B: '' })
  })
})
