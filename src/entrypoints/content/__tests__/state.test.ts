// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { createState } from '@/entrypoints/content/state'

describe('createState', () => {
  it('returns object with all expected core properties', () => {
    const state = createState()

    expect(state).toHaveProperty('tabId')
    expect(state).toHaveProperty('lastRightClickedElement')
    expect(state).toHaveProperty('lastRightClickedElementDetails')
  })

  it('initializes picker mode properties correctly', () => {
    const state = createState()

    expect(state.pickerModeActive).toBe(false)
    expect(state.highlightedElements).toBeInstanceOf(Map)
    expect(state.highlightedElements.size).toBe(0)
    expect(state.currentHoveredElement).toBeNull()
    expect(state.currentXPath).toBe('')
    expect(state.currentGuessedConfig).toBeNull()
    expect(state.selectorCandidates).toEqual([])
    expect(state.selectedCandidateIndex).toBe(0)
    expect(state.mouseUpdateScheduled).toBe(false)
    expect(state.lastMouseX).toBe(0)
    expect(state.lastMouseY).toBe(0)
  })

  it('initializes banner UI properties to null', () => {
    const state = createState()

    expect(state.pickerBannerUi).toBeNull()
    expect(state.bannerRootEl).toBeNull()
    expect(state.bannerCountEl).toBeNull()
    expect(state.bannerXPathEl).toBeNull()
    expect(state.bannerCloseBtn).toBeNull()
    expect(state.originalBodyMarginTopInline).toBeNull()
    expect(state.originalBodyMarginTopComputedPx).toBeNull()
    expect(state.bannerSetData).toBeNull()
  })

  it('initializes context menu properties correctly', () => {
    const state = createState()

    expect(state.pickerContextMenuHost).toBeNull()
    expect(state.pickerContextMenuUi).toBeNull()
    expect(state.pickerContextMenuOpen).toBe(false)
    expect(state.pickerContextMenuApi).toBeNull()
    expect(state.originalFixedElementTops).toBeInstanceOf(Map)
    expect(state.originalFixedElementTops.size).toBe(0)
    expect(state.pickerScrollAccumulator).toBe(0)
    expect(state.contextMenuX).toBe(0)
    expect(state.contextMenuY).toBe(0)
    expect(state.contextMenuWheelHandler).toBeNull()
  })

  it('initializes tabId to null', () => {
    const state = createState()

    expect(state.tabId).toBeNull()
  })

  it('initializes event handlers to null', () => {
    const state = createState()

    expect(state.pickerEventHandlers).toBeNull()
  })

  it('creates independent state instances', () => {
    const state1 = createState()
    const state2 = createState()

    // Modify state1
    state1.pickerModeActive = true
    state1.tabId = 123
    state1.currentXPath = '//div'

    // state2 should not be affected
    expect(state2.pickerModeActive).toBe(false)
    expect(state2.tabId).toBeNull()
    expect(state2.currentXPath).toBe('')
  })

  it('initializes all Map instances as new Maps', () => {
    const state1 = createState()
    const state2 = createState()

    // Maps should be different instances
    expect(state1.highlightedElements).not.toBe(state2.highlightedElements)
    expect(state1.originalFixedElementTops).not.toBe(state2.originalFixedElementTops)
  })

  it('returns mutable state object', () => {
    const state = createState()

    // Should be able to modify properties
    state.pickerModeActive = true
    expect(state.pickerModeActive).toBe(true)

    state.tabId = 456
    expect(state.tabId).toBe(456)

    state.currentXPath = '//span'
    expect(state.currentXPath).toBe('//span')
  })

  it('initializes all arrays as empty arrays', () => {
    const state = createState()

    expect(state.selectorCandidates).toEqual([])
    expect(state.selectorCandidates).toBeInstanceOf(Array)
  })
})
