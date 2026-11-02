// React Testing Library's DOM matchers (`toBeInTheDocument`, `toHaveValue`,
// `toBeDisabled`, ...), registered for every test file.
import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { createLockManager } from './tests/support/web-locks'

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

// Node 25+ defines a `localStorage` global of its own, unusable without
// `--localstorage-file`, and Vitest's jsdom environment leaves it in place of
// jsdom's. Vitest exposes the jsdom instance as the `jsdom` global.
declare const jsdom: { window: Window } | undefined
if (typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: jsdom.window.localStorage,
    configurable: true,
  })
}

beforeEach(() => {
  // A fresh manager per test, so a task one test leaves unsettled cannot hold a
  // key that a later test locks.
  Object.defineProperty(navigator, 'locks', { value: createLockManager(), configurable: true })
  // The fake throws from `extension.getBackgroundPage`, which context detection
  // calls on every extension page. Away from the background page a real browser
  // returns another window (Firefox) or nothing (Chromium MV3). Assigned rather
  // than spied, so `restoreMocks` returns a test's override to it.
  fakeBrowser.extension.getBackgroundPage = () => null
})
