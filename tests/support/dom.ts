/**
 * jsdom gaps that React Testing Library does not fill.
 *
 * Everything here stands in for a browser capability jsdom leaves unimplemented
 * rather than for anything the harness does. The unconditional shims live in
 * `vitest.setup.ts`; this file holds the ones a test has to opt into with a
 * value of its own.
 */

/**
 * Report a fixed `offsetWidth` for every element.
 *
 * jsdom has no layout engine, so every element measures 0 and code that sizes
 * itself off a rendered child never sees a width. Pass 0 to restore jsdom's own
 * behaviour between tests.
 */
export const stubOffsetWidth = (width: number): void => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
}
