// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  highlightElementsForPicker,
  highlightMatchingElements,
  isVisibleAndInViewport,
  removePickerHighlights,
} from '@/entrypoints/content/highlight'
import type { OriginalStyles } from '@/entrypoints/content/state'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isVisibleAndInViewport', () => {
  it('returns true for visible element in viewport', () => {
    document.body.innerHTML = `<div id="visible" style="position: absolute; top: 10px; left: 10px; width: 100px; height: 100px;">Visible</div>`
    const element = document.getElementById('visible') as Element

    // Mock checkVisibility to return true
    element.checkVisibility = vi.fn(() => true)

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(true)
  })

  it('returns false for element with visibility hidden', () => {
    document.body.innerHTML = `<div id="hidden" style="visibility: hidden;">Hidden</div>`
    const element = document.getElementById('hidden') as Element

    // Mock checkVisibility to return false
    element.checkVisibility = vi.fn(() => false)

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(false)
  })

  it('returns false for element outside viewport (above)', () => {
    document.body.innerHTML = `<div id="above">Above viewport</div>`
    const element = document.getElementById('above') as Element

    // Mock checkVisibility to return true
    element.checkVisibility = vi.fn(() => true)

    // Mock getBoundingClientRect to return position above viewport
    element.getBoundingClientRect = vi.fn(() => ({
      top: -100,
      bottom: -10,
      left: 0,
      right: 100,
      width: 100,
      height: 90,
      x: 0,
      y: -100,
      toJSON: () => ({}),
    }))

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(false)
  })

  it('returns false for element outside viewport (below)', () => {
    document.body.innerHTML = `<div id="below">Below viewport</div>`
    const element = document.getElementById('below') as Element

    element.checkVisibility = vi.fn(() => true)

    element.getBoundingClientRect = vi.fn(() => ({
      top: window.innerHeight + 100,
      bottom: window.innerHeight + 200,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: window.innerHeight + 100,
      toJSON: () => ({}),
    }))

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(false)
  })

  it('returns false for element outside viewport (left)', () => {
    document.body.innerHTML = `<div id="left">Left of viewport</div>`
    const element = document.getElementById('left') as Element

    element.checkVisibility = vi.fn(() => true)

    element.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 100,
      left: -200,
      right: -100,
      width: 100,
      height: 100,
      x: -200,
      y: 0,
      toJSON: () => ({}),
    }))

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(false)
  })

  it('returns false for element outside viewport (right)', () => {
    document.body.innerHTML = `<div id="right">Right of viewport</div>`
    const element = document.getElementById('right') as Element

    element.checkVisibility = vi.fn(() => true)

    element.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      bottom: 100,
      left: window.innerWidth + 100,
      right: window.innerWidth + 200,
      width: 100,
      height: 100,
      x: window.innerWidth + 100,
      y: 0,
      toJSON: () => ({}),
    }))

    const result = isVisibleAndInViewport(element)

    expect(result).toBe(false)
  })
})

describe('highlightMatchingElements', () => {
  it('applies animation to elements', () => {
    document.body.innerHTML = `
      <div id="elem1">Element 1</div>
      <div id="elem2">Element 2</div>
    `
    const elem1 = document.getElementById('elem1') as Element
    const elem2 = document.getElementById('elem2') as Element

    // Mock checkVisibility and getBoundingClientRect (needed for scroll check)
    elem1.checkVisibility = vi.fn(() => true)
    elem2.checkVisibility = vi.fn(() => true)
    elem1.getBoundingClientRect = vi.fn(() => ({
      top: 10,
      bottom: 110,
      left: 10,
      right: 110,
      width: 100,
      height: 100,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }))
    elem2.getBoundingClientRect = vi.fn(() => ({
      top: 120,
      bottom: 220,
      left: 10,
      right: 110,
      width: 100,
      height: 100,
      x: 10,
      y: 120,
      toJSON: () => ({}),
    }))

    // Mock animate method
    const animateSpy1 = vi.fn()
    const animateSpy2 = vi.fn()
    elem1.animate = animateSpy1
    elem2.animate = animateSpy2

    highlightMatchingElements([elem1, elem2])

    expect(animateSpy1).toHaveBeenCalledOnce()
    expect(animateSpy2).toHaveBeenCalledOnce()
    // Check animation keyframes are provided
    expect(animateSpy1.mock.calls[0][0]).toBeInstanceOf(Array)
    expect(animateSpy1.mock.calls[0][0].length).toBeGreaterThan(0)
  })

  it('scrolls first element into view by default', () => {
    document.body.innerHTML = `<div id="elem">Element</div>`
    const elem = document.getElementById('elem') as Element

    // Mock methods
    elem.checkVisibility = vi.fn(() => true)
    elem.getBoundingClientRect = vi.fn(() => ({
      top: window.innerHeight + 100, // Outside viewport
      bottom: window.innerHeight + 200,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: window.innerHeight + 100,
      toJSON: () => ({}),
    }))
    const scrollSpy = vi.fn()
    elem.scrollIntoView = scrollSpy
    elem.animate = vi.fn()

    highlightMatchingElements([elem])

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('does not scroll when shouldScroll is false', () => {
    document.body.innerHTML = `<div id="elem">Element</div>`
    const elem = document.getElementById('elem') as Element

    elem.checkVisibility = vi.fn(() => true)
    elem.getBoundingClientRect = vi.fn(() => ({
      top: window.innerHeight + 100,
      bottom: window.innerHeight + 200,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: window.innerHeight + 100,
      toJSON: () => ({}),
    }))
    const scrollSpy = vi.fn()
    elem.scrollIntoView = scrollSpy
    elem.animate = vi.fn()

    highlightMatchingElements([elem], { shouldScroll: false })

    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('does not scroll if first element already visible', () => {
    document.body.innerHTML = `<div id="elem">Element</div>`
    const elem = document.getElementById('elem') as Element

    elem.checkVisibility = vi.fn(() => true)
    elem.getBoundingClientRect = vi.fn(() => ({
      top: 10,
      bottom: 110,
      left: 10,
      right: 110,
      width: 100,
      height: 100,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }))
    const scrollSpy = vi.fn()
    elem.scrollIntoView = scrollSpy
    elem.animate = vi.fn()

    highlightMatchingElements([elem])

    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('handles empty array gracefully', () => {
    expect(() => highlightMatchingElements([])).not.toThrow()
  })
})

describe('highlightElementsForPicker', () => {
  it('saves original styles before applying highlight', () => {
    document.body.innerHTML = `<div id="elem" style="outline: 1px solid black; box-shadow: none;">Element</div>`
    const elem = document.getElementById('elem') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    highlightElementsForPicker([elem], highlightedElements)

    expect(highlightedElements.has(elem)).toBe(true)
    const saved = highlightedElements.get(elem)
    expect(saved).toBeDefined()
    expect(saved?.outline).toBe('1px solid black')
  })

  it('applies red outline and box-shadow highlight', () => {
    document.body.innerHTML = `<div id="elem">Element</div>`
    const elem = document.getElementById('elem') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    highlightElementsForPicker([elem], highlightedElements)

    expect(elem.style.outline).toContain('2px solid')
    expect(elem.style.outline).toContain('ff6b6b')
    expect(elem.style.outlineOffset).toBe('-1px')
    expect(elem.style.boxShadow).toContain('rgba(255, 107, 107')
  })

  it('clears previous highlights before applying new ones', () => {
    document.body.innerHTML = `
      <div id="elem1">Element 1</div>
      <div id="elem2">Element 2</div>
    `
    const elem1 = document.getElementById('elem1') as HTMLElement
    const elem2 = document.getElementById('elem2') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    // Highlight elem1 first
    highlightElementsForPicker([elem1], highlightedElements)
    expect(highlightedElements.size).toBe(1)
    expect(elem1.style.outline).toContain('ff6b6b')

    // Highlight elem2 (should clear elem1)
    highlightElementsForPicker([elem2], highlightedElements)
    expect(highlightedElements.size).toBe(1)
    expect(highlightedElements.has(elem2)).toBe(true)
    expect(highlightedElements.has(elem1)).toBe(false)
  })

  it('handles multiple elements', () => {
    document.body.innerHTML = `
      <div id="elem1">Element 1</div>
      <div id="elem2">Element 2</div>
      <div id="elem3">Element 3</div>
    `
    const elem1 = document.getElementById('elem1') as HTMLElement
    const elem2 = document.getElementById('elem2') as HTMLElement
    const elem3 = document.getElementById('elem3') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    highlightElementsForPicker([elem1, elem2, elem3], highlightedElements)

    expect(highlightedElements.size).toBe(3)
    expect(elem1.style.outline).toContain('ff6b6b')
    expect(elem2.style.outline).toContain('ff6b6b')
    expect(elem3.style.outline).toContain('ff6b6b')
  })
})

describe('removePickerHighlights', () => {
  it('restores original inline styles', () => {
    document.body.innerHTML = `<div id="elem" style="outline: 1px solid blue;">Element</div>`
    const elem = document.getElementById('elem') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    // Apply highlight (saves original styles)
    highlightElementsForPicker([elem], highlightedElements)

    // Verify highlight was applied
    expect(elem.style.outline).toContain('ff6b6b')

    // Remove highlight
    removePickerHighlights(highlightedElements)

    // Original style should be restored
    expect(elem.style.outline).toBe('1px solid blue')
  })

  it('clears the highlighted elements map', () => {
    document.body.innerHTML = `
      <div id="elem1">Element 1</div>
      <div id="elem2">Element 2</div>
    `
    const elem1 = document.getElementById('elem1') as HTMLElement
    const elem2 = document.getElementById('elem2') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    highlightElementsForPicker([elem1, elem2], highlightedElements)
    expect(highlightedElements.size).toBe(2)

    removePickerHighlights(highlightedElements)

    expect(highlightedElements.size).toBe(0)
  })

  it('handles empty map gracefully', () => {
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    expect(() => removePickerHighlights(highlightedElements)).not.toThrow()
  })

  it('handles elements with no original styles set', () => {
    document.body.innerHTML = `<div id="elem">Element</div>`
    const elem = document.getElementById('elem') as HTMLElement
    const highlightedElements = new Map<HTMLElement, OriginalStyles>()

    // Manually set highlight without original styles
    elem.style.outline = '2px solid #ff6b6b'
    highlightedElements.set(elem, { outline: '', outlineOffset: '', boxShadow: '' })

    removePickerHighlights(highlightedElements)

    expect(elem.style.outline).toBe('')
    expect(highlightedElements.size).toBe(0)
  })
})
