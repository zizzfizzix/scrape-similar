// React Testing Library's DOM matchers (`toBeInTheDocument`, `toHaveValue`,
// `toBeDisabled`, ...), registered for every test file.
import '@testing-library/jest-dom/vitest'

// JSDom + Vitest don't play well with each other. Long story short - default
// TextEncoder produces Uint8Array objects that are _different_ from the global
// Uint8Array objects, so some functions that compare their types explode.
// https://github.com/vitest-dev/vitest/issues/4043#issuecomment-1905172846
class ESBuildAndJSDOMCompatibleTextEncoder extends TextEncoder {
  constructor() {
    super()
  }

  override encode(input: string) {
    if (typeof input !== 'string') {
      throw new TypeError('`input` must be a string')
    }

    const decodedURI = decodeURIComponent(encodeURIComponent(input))
    const chars = decodedURI.split('')
    const arr = new Uint8Array(chars.length)
    for (const [i, char] of chars.entries()) {
      arr[i] = char.charCodeAt(0)
    }
    return arr
  }
}

global.TextEncoder = ESBuildAndJSDOMCompatibleTextEncoder

// Tell React it is running under a test harness, so `act` flushes effects
// instead of warning that the environment does not support it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom implements no CSS media queries, but `next-themes` and the responsive
// Dialog/Drawer switch both call `matchMedia` on mount. Report "no match" so
// components fall back to their desktop/light defaults.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// Radix primitives (dropdown, dialog, drawer, popover) drive their open state
// from pointer events and measure their content. jsdom implements none of that,
// so provide the minimum each primitive reaches for.
if (typeof window !== 'undefined') {
  if (typeof window.PointerEvent !== 'function') {
    class JsdomPointerEvent extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      readonly isPrimary: boolean

      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params)
        this.pointerId = params.pointerId ?? 1
        this.pointerType = params.pointerType ?? 'mouse'
        this.isPrimary = params.isPrimary ?? true
      }
    }
    window.PointerEvent = JsdomPointerEvent as unknown as typeof window.PointerEvent
  }

  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  // The autosuggest and the columns strip both scroll their selection into
  // view; jsdom has no layout engine, so these throw rather than no-op.
  Element.prototype.scrollTo ??= () => {}

  if (typeof window.ResizeObserver !== 'function') {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof window.ResizeObserver
  }
}
