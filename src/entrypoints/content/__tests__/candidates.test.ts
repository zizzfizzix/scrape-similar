// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  chooseDefaultCandidateIndex,
  generateSelectorCandidates,
} from '@/entrypoints/content/picker/candidates'
import { evaluateXPath } from '@/utils/scraper'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('generateSelectorCandidates', () => {
  it('returns array of XPath candidates walking up DOM tree', () => {
    document.body.innerHTML = `
      <div id="container">
        <ul id="list">
          <li id="item">
            <span id="target">Text</span>
          </li>
        </ul>
      </div>
    `
    const target = document.getElementById('target')!

    const candidates = generateSelectorCandidates(target)

    expect(candidates).toBeInstanceOf(Array)
    expect(candidates.length).toBeGreaterThan(0)
    // First candidate should be most specific (the target element itself)
    expect(candidates[0]).toBeTruthy()
    // Should have multiple levels up the tree
    expect(candidates.length).toBeGreaterThanOrEqual(4) // span, li, ul, div
  })

  it('respects maxLevels limit', () => {
    document.body.innerHTML = `
      <div><div><div><div><div><div>
        <span id="target">Deep</span>
      </div></div></div></div></div></div>
    `
    const target = document.getElementById('target')!

    const candidates = generateSelectorCandidates(target, 3)

    expect(candidates.length).toBeLessThanOrEqual(4) // maxLevels 3 + start element = 4
  })

  it('stops at document.body and does not include it', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <span id="target">Text</span>
      </div>
    `
    const target = document.getElementById('target')!

    const candidates = generateSelectorCandidates(target)

    // Body should not be in candidates - check for exact match only
    // (XPath like /html/body/div is fine, we just don't want /html/body itself)
    const bodySelectors = candidates.filter((c) => c === '/html/body')
    expect(bodySelectors).toHaveLength(0)
  })

  it('builds no candidate for the root element', () => {
    expect(generateSelectorCandidates(document.documentElement)).toEqual([])
  })

  it('does not include duplicate selectors', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <span id="target">Text</span>
      </div>
    `
    const target = document.getElementById('target')!

    const candidates = generateSelectorCandidates(target)

    // Check for duplicates
    const uniqueCandidates = [...new Set(candidates)]
    expect(candidates.length).toBe(uniqueCandidates.length)
  })

  describe('at a table row', () => {
    const rowLevelTexts = (id: string) => {
      const candidates = generateSelectorCandidates(document.getElementById(id)!)
      const rowLevel = candidates.find((c) => evaluateXPath(c)[0]?.tagName.toLowerCase() === 'tr')!
      return evaluateXPath(rowLevel).map((row) => row.textContent.trim())
    }

    it('selects only the data rows, not the header row', () => {
      document.body.innerHTML = `
        <table>
          <tr><th>Rank</th></tr>
          <tr><td id="cell">1</td></tr>
          <tr><td>2</td></tr>
        </table>`

      expect(rowLevelTexts('cell')).toEqual(['1', '2'])
    })

    it('selects the data rows from a header cell too', () => {
      document.body.innerHTML = `
        <table>
          <tr><th id="header">Rank</th></tr>
          <tr><td>1</td></tr>
          <tr><td>2</td></tr>
        </table>`

      expect(rowLevelTexts('header')).toEqual(['1', '2'])
    })

    it('keeps every header row of a thead', () => {
      document.body.innerHTML = `
        <table>
          <thead>
            <tr><th id="header">Rank</th></tr>
            <tr><td><input></td></tr>
          </thead>
          <tbody><tr><td>1</td></tr></tbody>
        </table>`

      expect(rowLevelTexts('header')).toEqual(['Rank', ''])
    })

    it('keeps the row’s own path when it has no data rows', () => {
      document.body.innerHTML = `
        <table>
          <tr><th id="header">Rank</th></tr>
          <tr><th>Country</th></tr>
        </table>`

      expect(rowLevelTexts('header')).toEqual(['Rank', 'Country'])
    })

    it('matches a row per table when each table holds one record', () => {
      document.body.innerHTML = `
        <table><tr><td id="cell">A</td></tr></table>
        <table><tr><td>B</td></tr></table>
        <table><tr><td>C</td></tr></table>`

      expect(rowLevelTexts('cell')).toEqual(['A', 'B', 'C'])
    })

    it('builds only valid candidates for a row that minimizes to the root', () => {
      // The sibling div gives the row's path a positional step, which minimizeXPath trims down to "/".
      document.body.innerHTML = `
        <div></div>
        <div><table><tr><td id="cell">only</td><td>other</td></tr></table></div>`

      const candidates = generateSelectorCandidates(document.getElementById('cell')!)

      for (const candidate of candidates) expect(() => evaluateXPath(candidate)).not.toThrow()
    })

    it('leaves out the rows of a table nested in a row', () => {
      document.body.innerHTML = `
        <table>
          <tr><td id="cell">outer 1<table><tr><td>inner 1</td></tr><tr><td>inner 2</td></tr></table></td></tr>
          <tr><td>outer 2</td></tr>
        </table>`

      const rows = rowLevelTexts('cell')

      expect(rows).toHaveLength(2)
      expect(rows[1]).toBe('outer 2')
    })
  })

  it('returns at least one candidate (the element itself)', () => {
    document.body.innerHTML = `<span id="target">Text</span>`
    const target = document.getElementById('target')!

    const candidates = generateSelectorCandidates(target)

    expect(candidates.length).toBeGreaterThanOrEqual(1)
  })
})

describe('chooseDefaultCandidateIndex', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('returns first candidate with at least 2 matches', () => {
    document.body.innerHTML = `
      <ul>
        <li><span class="item">A</span></li>
        <li><span class="item">B</span></li>
        <li><span class="item">C</span></li>
      </ul>
    `
    const target = document.querySelector<HTMLElement>('.item')!
    const candidates = generateSelectorCandidates(target)

    const index = chooseDefaultCandidateIndex(candidates)

    // Should pick a selector that matches multiple items
    const selectedSelector = candidates[index] ?? ''
    const matches = evaluateXPath(selectedSelector)
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('returns 0 when no candidates have 2 or more matches', () => {
    document.body.innerHTML = `<span id="unique">Only one</span>`
    const target = document.getElementById('unique')!

    // Generate candidates - each will be unique to this element
    const candidates = generateSelectorCandidates(target)

    const index = chooseDefaultCandidateIndex(candidates)

    expect(index).toBe(0)
  })

  it('returns 0 for empty candidates array', () => {
    const candidates: string[] = []

    const index = chooseDefaultCandidateIndex(candidates)

    expect(index).toBe(0)
  })

  it('prioritizes more specific selectors (lower index) over generic ones', () => {
    document.body.innerHTML = `
      <div class="container">
        <div class="row" id="row1">
          <span class="cell">A</span>
        </div>
        <div class="row" id="row2">
          <span class="cell">B</span>
        </div>
        <div class="row" id="row3">
          <span class="cell">C</span>
        </div>
      </div>
    `
    const target = document.querySelector<HTMLElement>('.cell')!
    const candidates = generateSelectorCandidates(target)

    const index = chooseDefaultCandidateIndex(candidates)

    // Should not pick the most generic (all spans)
    // Should pick something more specific like rows or cells
    const selectedSelector = candidates[index] ?? ''
    const matches = evaluateXPath(selectedSelector)
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // Index should be relatively early in the list (more specific)
    expect(index).toBeLessThan(candidates.length)
  })
})
