/**
 * The nearest HTML element at or above `node`, so an SVG icon or a `<path>`
 * inside one resolves to the link or button around it. An XPath name test
 * without a namespace prefix matches no SVG element in an HTML document, so a
 * path ending in one finds nothing. HTML inside an SVG `<foreignObject>` is
 * returned as is, and its path still has SVG steps above it.
 */
export const closestHtmlElement = (node: EventTarget | null): HTMLElement | null => {
  let el = node instanceof Element ? node : null
  while (el && !(el instanceof HTMLElement)) el = el.parentElement
  return el
}
