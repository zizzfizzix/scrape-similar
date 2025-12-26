import type { OriginalStyles } from '@/entrypoints/content/state'

/**
 * Check if an element is visible and in the viewport
 */
export function isVisibleAndInViewport(element: Element): boolean {
  if (!element.checkVisibility()) return false

  const rect = element.getBoundingClientRect()
  if (
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > window.innerHeight ||
    rect.left > window.innerWidth
  ) {
    return false
  }
  return true
}

/**
 * Highlight matching elements in the page using Web Animations API
 */
export const highlightMatchingElements = (
  elements: Element[],
  options?: { shouldScroll?: boolean },
): void => {
  const shouldScroll = options?.shouldScroll !== false
  // Scroll first element into view if available (unless disabled)
  if (shouldScroll && elements.length > 0 && !isVisibleAndInViewport(elements[0])) {
    elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  elements.forEach((element) => {
    element.animate(
      [
        {
          outline: '0px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0,
        },
        {
          outline: '5px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1.2)',
          offset: 0.1,
        },
        {
          outline: '4px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.25,
        },
        {
          outline: '3px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.5,
        },
        {
          outline: '2px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 0.75,
        },
        {
          outline: '1px solid #5c8df6',
          outlineOffset: '2px',
          transform: 'scale(1)',
          offset: 1,
        },
      ],
      {
        duration: 3000,
        iterations: 1,
        easing: 'ease-out',
      },
    )
  })
}

/**
 * Remove picker highlights and restore original styles
 */
export const removePickerHighlights = (
  highlightedElements: Map<HTMLElement, OriginalStyles>,
): void => {
  highlightedElements.forEach((original, el) => {
    el.style.outline = original.outline
    el.style.outlineOffset = original.outlineOffset
    el.style.boxShadow = original.boxShadow
  })
  highlightedElements.clear()
}

/**
 * Use direct element styling for highlight to keep stacking context close to the node
 * and avoid global z-index issues (we restore original inline styles on cleanup).
 */
export const highlightElementsForPicker = (
  elements: HTMLElement[],
  highlightedElements: Map<HTMLElement, OriginalStyles>,
): void => {
  // Clear previous element inline styling
  removePickerHighlights(highlightedElements)

  elements.forEach((el) => {
    // Save original inline styles we are about to modify
    const original: OriginalStyles = {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      boxShadow: el.style.boxShadow,
    }
    highlightedElements.set(el, original)

    // Apply non-intrusive highlight directly to the element
    el.style.outline = '2px solid #ff6b6b'
    el.style.outlineOffset = '-1px'
    el.style.boxShadow = 'inset 0 0 0 9999px rgba(255, 107, 107, 0.16)'
  })
}
