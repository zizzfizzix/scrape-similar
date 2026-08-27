// @vitest-environment jsdom
import {
  buildColumnsForElement,
  buildTableRowColumns,
  buildTableRowSelector,
  findNearestRepeatingNode,
  findRepeatedRowAncestor,
  findScrapeAncestor,
  getDataAttributes,
} from '@/utils/scrape-guess'
import { beforeEach, describe, expect, it } from 'vitest'

/** Render `html` into the document body and return the element matching `selector`. */
const render = <T extends HTMLElement = HTMLElement>(html: string, selector: string): T => {
  document.body.innerHTML = html
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`No element matched ${selector}`)
  return element
}

/**
 * A `tr` outside a table, which the HTML parser refuses to produce from markup.
 */
const detachedRow = (cellCount: number): HTMLElement => {
  const row = document.createElement('tr')
  for (let i = 0; i < cellCount; i++) {
    const cell = document.createElement('td')
    cell.textContent = String(i + 1)
    row.append(cell)
  }
  document.body.append(row)
  return row
}

const names = (columns: ColumnDefinition[]) => columns.map((column) => column.name)
const selectors = (columns: ColumnDefinition[]) => columns.map((column) => column.selector)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('getDataAttributes', () => {
  it('maps every data-* attribute to its own column', () => {
    const element = render('<div data-id="7" data-kind="row" class="x" id="y"></div>', 'div')

    expect(getDataAttributes(element)).toEqual([
      { name: 'data-id', selector: '@data-id' },
      { name: 'data-kind', selector: '@data-kind' },
    ])
  })

  it('returns nothing when the element has no data attributes', () => {
    expect(getDataAttributes(render('<div class="x"></div>', 'div'))).toEqual([])
  })
})

describe('findRepeatedRowAncestor', () => {
  it('finds the table row when the table has several', () => {
    const cell = render(
      '<table><tbody><tr><td id="c">a</td></tr><tr><td>b</td></tr></tbody></table>',
      '#c',
    )

    expect(findRepeatedRowAncestor(cell)?.tagName).toBe('TR')
  })

  it('ignores a lone table row', () => {
    const cell = render('<table><tbody><tr><td id="c">a</td></tr></tbody></table>', '#c')

    expect(findRepeatedRowAncestor(cell)).toBeNull()
  })

  it('finds the list item when the list has several', () => {
    const span = render('<ul><li><span id="s">a</span></li><li>b</li></ul>', '#s')

    expect(findRepeatedRowAncestor(span)?.tagName).toBe('LI')
  })

  it('finds a repeated definition term', () => {
    const span = render('<dl><dt><span id="s">a</span></dt><dd>x</dd><dt>b</dt></dl>', '#s')

    expect(findRepeatedRowAncestor(span)?.tagName).toBe('DT')
  })

  it('finds a repeated definition description', () => {
    const span = render('<dl><dt>a</dt><dd><span id="s">x</span></dd><dd>y</dd></dl>', '#s')

    expect(findRepeatedRowAncestor(span)?.tagName).toBe('DD')
  })

  it('returns null when the element is in no row-ish container', () => {
    expect(findRepeatedRowAncestor(render('<div id="d">a</div>', '#d'))).toBeNull()
  })

  it('prefers a table row over an enclosing list item', () => {
    const cell = render(
      '<ul><li><table><tr><td id="c">a</td></tr><tr><td>b</td></tr></table></li><li>x</li></ul>',
      '#c',
    )

    expect(findRepeatedRowAncestor(cell)?.tagName).toBe('TR')
  })
})

describe('findNearestRepeatingNode', () => {
  it('returns the element itself when it already has same-tag siblings', () => {
    const element = render('<div><p id="p">a</p><p>b</p></div>', '#p')

    expect(findNearestRepeatingNode(element).id).toBe('p')
  })

  it('climbs to the nearest repeating ancestor', () => {
    const element = render(
      '<div><div class="card"><span id="s">a</span></div><div class="card"><span>b</span></div></div>',
      '#s',
    )

    expect(findNearestRepeatingNode(element).className).toBe('card')
  })

  it('keeps climbing past a broad layout container with too few siblings', () => {
    const element = render(
      `<div>
         <div class="wrap"><section><span id="s">a</span></section><section>b</section></div>
         <div class="wrap">x</div>
       </div>`,
      '#s',
    )

    expect(findNearestRepeatingNode(element).className).toBe('wrap')
  })

  it('accepts a layout container once there are enough siblings', () => {
    const element = render(
      '<div><section><span id="s">a</span></section><section>b</section><section>c</section></div>',
      '#s',
    )

    expect(findNearestRepeatingNode(element).tagName).toBe('SECTION')
  })

  it('never treats body as a repeating unit', () => {
    const element = render('<div id="only">a</div>', '#only')

    expect(findNearestRepeatingNode(element).id).toBe('only')
  })

  it('falls back to the element when nothing repeats', () => {
    const element = render('<div><div><div><span id="s">a</span></div></div></div>', '#s')

    expect(findNearestRepeatingNode(element).id).toBe('s')
  })
})

describe('findScrapeAncestor', () => {
  it('prefers a repeated row over a generic repeating ancestor', () => {
    const cell = render(
      '<table><tbody><tr><td id="c">a</td></tr><tr><td>b</td></tr></tbody></table>',
      '#c',
    )

    expect(findScrapeAncestor(cell).tagName).toBe('TR')
  })

  it('falls back to the nearest repeating node', () => {
    const element = render(
      '<div><div class="card"><span id="s">a</span></div><div class="card">b</div></div>',
      '#s',
    )

    expect(findScrapeAncestor(element).className).toBe('card')
  })
})

describe('buildTableRowSelector', () => {
  it('targets every data row of the row’s own table', () => {
    const row = render(
      `<table><tr><td>first</td></tr></table>
       <table><tr id="r"><td>second</td></tr></table>`,
      '#r',
    )

    expect(buildTableRowSelector(row)).toBe('(//table)[2]//tr[td]')
  })

  it('returns null for a row outside any table', () => {
    expect(buildTableRowSelector(detachedRow(1))).toBeNull()
  })
})

describe('buildTableRowColumns', () => {
  it('names columns after the thead header cells', () => {
    const row = render(
      `<table>
         <thead><tr><th>Rank</th><th>Country</th></tr></thead>
         <tbody><tr id="r"><td>1</td><td>Poland</td></tr></tbody>
       </table>`,
      '#r',
    )

    expect(buildTableRowColumns(row)).toEqual([
      { name: 'Rank', key: 'col1', selector: '*[1]' },
      { name: 'Country', key: 'col2', selector: '*[2]' },
    ])
  })

  it('uses the last header row when thead holds several', () => {
    const row = render(
      `<table>
         <thead>
           <tr><th>Group</th><th>Group</th></tr>
           <tr><th>Rank</th><th>Country</th></tr>
         </thead>
         <tbody><tr id="r"><td>1</td><td>Poland</td></tr></tbody>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Rank', 'Country'])
  })

  it('falls back to the closest preceding row of th cells', () => {
    const row = render(
      `<table>
         <tr><th>Rank</th><th>Country</th></tr>
         <tr id="r"><td>1</td><td>Poland</td></tr>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Rank', 'Country'])
  })

  it('skips a preceding row with no th cells', () => {
    const row = render(
      `<table>
         <tr><th>Rank</th><th>Country</th></tr>
         <tr><td>filler</td><td>filler</td></tr>
         <tr id="r"><td>1</td><td>Poland</td></tr>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Rank', 'Country'])
  })

  it('falls back to any th in the table when none precede the row', () => {
    const row = render(
      `<table>
         <tr id="r"><td>1</td><td>Poland</td></tr>
         <tr><th>Rank</th><th>Country</th></tr>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Rank', 'Country'])
  })

  it('ignores a thead whose row has no th cells', () => {
    const row = render(
      `<table>
         <thead><tr><td>not a header</td></tr></thead>
         <tbody><tr id="r"><td>1</td></tr></tbody>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Column 1'])
  })

  it('numbers columns when the table has no headers at all', () => {
    const row = render('<table><tr id="r"><td>1</td><td>2</td></tr></table>', '#r')

    expect(names(buildTableRowColumns(row))).toEqual(['Column 1', 'Column 2'])
  })

  it('numbers a column whose header cell is blank', () => {
    const row = render(
      `<table>
         <thead><tr><th>Rank</th><th>  </th></tr></thead>
         <tbody><tr id="r"><td>1</td><td>Poland</td></tr></tbody>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['Rank', 'Column 2'])
  })

  it('counts row-header th cells alongside td cells', () => {
    const row = render('<table><tr id="r"><th>Poland</th><td>38M</td></tr></table>', '#r')

    expect(selectors(buildTableRowColumns(row))).toEqual(['*[1]', '*[2]'])
  })

  it('ignores non-cell children of the row', () => {
    const row = detachedRow(1)
    row.append(document.createElement('span'))

    expect(buildTableRowColumns(row)).toHaveLength(1)
  })

  it('extends to the header count when the row has fewer cells', () => {
    const row = render(
      `<table>
         <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
         <tbody><tr id="r"><td>1</td></tr></tbody>
       </table>`,
      '#r',
    )

    expect(names(buildTableRowColumns(row))).toEqual(['A', 'B', 'C'])
  })

  it('numbers all cells for a row with no enclosing table', () => {
    expect(names(buildTableRowColumns(detachedRow(2)))).toEqual(['Column 1', 'Column 2'])
  })
})

describe('buildColumnsForElement', () => {
  const columnsFor = (html: string, selector: string) =>
    buildColumnsForElement(render(html, selector))

  it('delegates table rows to the table row builder', () => {
    const columns = columnsFor(
      '<table><thead><tr><th>Rank</th></tr></thead><tbody><tr id="r"><td>1</td></tr></tbody></table>',
      '#r',
    )

    expect(columns).toEqual([{ name: 'Rank', key: 'col1', selector: '*[1]' }])
  })

  it('describes an anchor', () => {
    expect(names(columnsFor('<a id="a" href="/x">go</a>', '#a'))).toEqual([
      'Anchor text',
      'URL',
      'Rel',
      'Target',
    ])
  })

  it('describes an image', () => {
    expect(names(columnsFor('<img id="i" src="x.png">', '#i'))).toEqual([
      'Alt Text',
      'Source',
      'Title',
    ])
  })

  it('describes a button', () => {
    expect(names(columnsFor('<button id="b">Go</button>', '#b'))).toEqual([
      'Text',
      'Value',
      'ARIA Label',
      'Disabled',
    ])
  })

  it('describes a text input without a checked column', () => {
    expect(names(columnsFor('<input id="i" type="text">', '#i'))).toEqual([
      'Value',
      'Placeholder',
      'Name',
      'Type',
    ])
  })

  it('adds a checked column for a checkbox', () => {
    expect(names(columnsFor('<input id="i" type="checkbox">', '#i'))).toContain('Checked')
  })

  it('adds a checked column for a radio button', () => {
    expect(names(columnsFor('<input id="i" type="radio">', '#i'))).toContain('Checked')
  })

  it('describes an input with no type attribute', () => {
    expect(names(columnsFor('<input id="i">', '#i'))).not.toContain('Checked')
  })

  it('describes a textarea', () => {
    expect(names(columnsFor('<textarea id="t"></textarea>', '#t'))).toEqual([
      'Value',
      'Placeholder',
      'Name',
    ])
  })

  it('describes a select', () => {
    expect(names(columnsFor('<select id="s"></select>', '#s'))).toEqual(['Selected Option', 'Name'])
  })

  it('describes a definition term', () => {
    expect(names(columnsFor('<dl><dt id="d">t</dt></dl>', '#d'))).toEqual(['Term', 'Definition'])
  })

  it('describes a list item', () => {
    expect(columnsFor('<ul><li id="l">a</li></ul>', '#l')).toEqual([
      { name: 'List Item', selector: '.' },
    ])
  })

  it('describes each heading level', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const columns = columnsFor(`<h${level} id="h">t</h${level}>`, '#h')
      expect(names(columns)).toEqual(['Heading', 'ARIA Label'])
    }
  })

  it('describes a section and surfaces its first heading', () => {
    const columns = columnsFor('<section id="s"><h2>Title</h2><p>body</p></section>', '#s')

    expect(columns).toEqual([
      { name: 'Text', selector: '.' },
      { name: 'ARIA Label', selector: '@aria-label' },
      { name: 'Headline', selector: 'h2' },
    ])
  })

  it('omits the headline column for a section with no heading', () => {
    expect(names(columnsFor('<article id="a"><p>body</p></article>', '#a'))).toEqual([
      'Text',
      'ARIA Label',
    ])
  })

  it('describes main and aside like other sectioning containers', () => {
    expect(names(columnsFor('<main id="m"><p>x</p></main>', '#m'))).toEqual(['Text', 'ARIA Label'])
    expect(names(columnsFor('<aside id="a"><p>x</p></aside>', '#a'))).toEqual([
      'Text',
      'ARIA Label',
    ])
  })

  it('describes a figure', () => {
    expect(names(columnsFor('<figure id="f"><img src="x"></figure>', '#f'))).toEqual([
      'Image Source',
      'Image Alt',
      'Image Title',
      'Caption',
      'Code',
      'Blockquote',
      'Paragraph',
      'Figure Text',
    ])
  })

  it('describes a blockquote', () => {
    expect(names(columnsFor('<blockquote id="b">q</blockquote>', '#b'))).toEqual([
      'Quote',
      'Citation',
      'Footer',
      'Cite Element',
    ])
  })

  it('describes a code block', () => {
    expect(names(columnsFor('<pre id="p">x</pre>', '#p'))).toEqual(['Code', 'Language', 'Class'])
  })

  it('adds the figure caption column for code inside a figure', () => {
    expect(names(columnsFor('<figure><code id="c">x</code></figure>', '#c'))).toContain('Caption')
  })

  it('describes colgroup and col identically', () => {
    const expected = ['Span', 'Class', 'Style']
    expect(names(columnsFor('<table><colgroup id="cg"></colgroup></table>', '#cg'))).toEqual(
      expected,
    )
    expect(names(columnsFor('<table><colgroup><col id="c"></colgroup></table>', '#c'))).toEqual(
      expected,
    )
  })

  it('describes a table, including its caption and columns', () => {
    const columns = columnsFor(
      `<table id="t">
         <caption>Populations</caption>
         <colgroup><col span="2"></colgroup>
         <tr><th>Rank</th><th>Country</th></tr>
       </table>`,
      '#t',
    )

    expect(columns).toEqual([
      { name: 'Caption', selector: 'caption' },
      { name: 'Rank', selector: './/tr/td[1]' },
      { name: 'Country', selector: './/tr/td[2]' },
      { name: 'Col Count', selector: 'count(col)' },
      { name: 'Col 1 Span', selector: './/col[1]/@span' },
    ])
  })

  it('omits the caption column for a table without one', () => {
    expect(names(columnsFor('<table id="t"><tr><td>1</td></tr></table>', '#t'))).toEqual([
      'Col Count',
    ])
  })

  it('numbers a table header cell that is blank', () => {
    expect(names(columnsFor('<table id="t"><tr><th> </th></tr></table>', '#t'))).toEqual([
      'Column 1',
      'Col Count',
    ])
  })

  it('describes unordered and ordered lists', () => {
    expect(columnsFor('<ul id="u"><li>a</li></ul>', '#u')).toEqual([
      { name: 'List Item', selector: 'li' },
    ])
    expect(columnsFor('<ol id="o"><li>a</li></ol>', '#o')).toEqual([
      { name: 'List Item', selector: 'li' },
    ])
  })

  it('describes a definition list', () => {
    expect(names(columnsFor('<dl id="d"><dt>t</dt><dd>d</dd></dl>', '#d'))).toEqual([
      'Term',
      'Definition',
    ])
  })

  it('describes a form', () => {
    expect(names(columnsFor('<form id="f"></form>', '#f'))).toEqual([
      'Action',
      'Method',
      'Input Names',
      'Input Types',
    ])
  })

  it('describes a nav', () => {
    expect(names(columnsFor('<nav id="n"><a href="/x">x</a></nav>', '#n'))).toEqual([
      'Text',
      'ARIA Label',
      'Links',
    ])
  })

  it('describes header and footer', () => {
    expect(names(columnsFor('<header id="h">x</header>', '#h'))).toEqual(['Text', 'ARIA Label'])
    expect(names(columnsFor('<footer id="f">x</footer>', '#f'))).toEqual(['Text', 'ARIA Label'])
  })

  it('describes video and audio', () => {
    const expected = ['Source', 'Poster', 'Controls', 'Captions']
    expect(names(columnsFor('<video id="v"></video>', '#v'))).toEqual(expected)
    expect(names(columnsFor('<audio id="a"></audio>', '#a'))).toEqual(expected)
  })

  it('describes details and summary', () => {
    expect(names(columnsFor('<details id="d"><summary>s</summary></details>', '#d'))).toEqual([
      'Summary',
      'Details',
    ])
    expect(columnsFor('<details><summary id="s">s</summary></details>', '#s')).toEqual([
      { name: 'Summary', selector: '.' },
    ])
  })

  it('falls back to the element text for an unrecognised tag', () => {
    expect(columnsFor('<span id="s">x</span>', '#s')).toEqual([{ name: 'Text', selector: '.' }])
  })

  it('surfaces an ARIA label on an unrecognised tag', () => {
    expect(names(columnsFor('<span id="s" aria-label="Close">x</span>', '#s'))).toEqual([
      'ARIA Label',
      'Text',
    ])
  })

  it('appends data attributes to whatever the tag builder produced', () => {
    const columns = columnsFor('<a id="a" href="/x" data-track="cta">go</a>', '#a')

    expect(columns.at(-1)).toEqual({ name: 'data-track', selector: '@data-track' })
  })
})
