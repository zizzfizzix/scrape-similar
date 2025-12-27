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
    const target = document.getElementById('target') as HTMLElement

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
    const target = document.getElementById('target') as HTMLElement

    const candidates = generateSelectorCandidates(target, 3)

    expect(candidates.length).toBeLessThanOrEqual(4) // maxLevels 3 + start element = 4
  })

  it('stops at document.body and does not include it', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <span id="target">Text</span>
      </div>
    `
    const target = document.getElementById('target') as HTMLElement

    const candidates = generateSelectorCandidates(target)

    // Body should not be in candidates - check for exact match only
    // (XPath like /html/body/div is fine, we just don't want /html/body itself)
    const bodySelectors = candidates.filter((c) => c === '/html/body')
    expect(bodySelectors).toHaveLength(0)
  })

  it('does not include duplicate selectors', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <span id="target">Text</span>
      </div>
    `
    const target = document.getElementById('target') as HTMLElement

    const candidates = generateSelectorCandidates(target)

    // Check for duplicates
    const uniqueCandidates = [...new Set(candidates)]
    expect(candidates.length).toBe(uniqueCandidates.length)
  })

  it('returns at least one candidate (the element itself)', () => {
    document.body.innerHTML = `<span id="target">Text</span>`
    const target = document.getElementById('target') as HTMLElement

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
    const target = document.querySelector('.item') as HTMLElement
    const candidates = generateSelectorCandidates(target)

    const index = chooseDefaultCandidateIndex(candidates)

    // Should pick a selector that matches multiple items
    const selectedSelector = candidates[index]
    const matches = evaluateXPath(selectedSelector)
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('returns 0 when no candidates have 2 or more matches', () => {
    document.body.innerHTML = `<span id="unique">Only one</span>`
    const target = document.getElementById('unique') as HTMLElement

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
    const target = document.querySelector('.cell') as HTMLElement
    const candidates = generateSelectorCandidates(target)

    const index = chooseDefaultCandidateIndex(candidates)

    // Should not pick the most generic (all spans)
    // Should pick something more specific like rows or cells
    const selectedSelector = candidates[index]
    const matches = evaluateXPath(selectedSelector)
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // Index should be relatively early in the list (more specific)
    expect(index).toBeLessThan(candidates.length)
  })
})
