import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

import { spyOnBrowser } from '@@/tests/support/fake-browser'

import {
  EXTENSION_CONTEXTS,
  getCurrentContext,
  isBackgroundContext,
  isContentScript,
  isFullDataView,
  isOnboardingPage,
  isOptionsPage,
  isPopup,
  isSidePanel,
} from '@/utils/context-detection'

// The tests remove and replace `window`, `self` and `browser.tabs` to mimic each context.
const testGlobal = globalThis as unknown as {
  window?: Window
  self?: unknown
  browser?: { tabs?: unknown }
}

let originalWindow: Window | undefined
let originalTabs: unknown

beforeEach(() => {
  // Preserve the original globals to restore later
  originalWindow = globalThis.window
  // Preserve the original tabs reference (fakeBrowser adds this)
  originalTabs = testGlobal.browser?.tabs

  // Reset fake browser between tests to clear previous stubs/state
  fakeBrowser.reset()
})

afterEach(() => {
  Reflect.deleteProperty(fakeBrowser, 'extension')
  // Restore window
  if (typeof originalWindow === 'undefined') {
    delete testGlobal.window
  } else {
    testGlobal.window = originalWindow
  }

  // Restore tabs property back onto browser if it was modified
  const browserObj = testGlobal.browser
  if (browserObj) {
    if (typeof originalTabs === 'undefined') {
      delete browserObj.tabs
    } else {
      browserObj.tabs = originalTabs
    }
  }

  vi.restoreAllMocks()
})

const createWindow = ({
  origin = fakeBrowser.runtime.getURL('/' as never).slice(0, -1),
  pathname,
}: {
  origin?: string
  pathname: string
}) => ({
  location: {
    href: `${origin}${pathname}`,
    pathname,
  },
})

const getEntrypointPaths = () => {
  const entrypoints = import.meta.glob('@/entrypoints/**/*.html')
  return Object.keys(entrypoints).map((path) => {
    const filename = path.split('/').pop()!
    if (filename === 'index.html') {
      return `/${path.split('/').at(-2)}.html`
    }
    return `/${filename}`
  })
}

describe('context detection utilities', () => {
  it('detects content script context', () => {
    vi.stubGlobal('window', {})
    // Remove tabs to mimic content script environment. `fakeBrowser` always
    // installs `browser`.
    delete testGlobal.browser!.tabs

    expect(isContentScript()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.CONTENT_SCRIPT)
  })

  it('detects background context', () => {
    vi.stubGlobal('window', undefined)
    if (typeof testGlobal.self === 'undefined') {
      testGlobal.self = globalThis
    }

    expect(isBackgroundContext()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.BACKGROUND)
  })

  it('does not take a content script for the background', () => {
    vi.stubGlobal('window', undefined)
    delete (globalThis as any).browser.tabs

    expect(isBackgroundContext()).toBe(false)
  })

  it('detects the Firefox background page, which has a window', () => {
    spyOnBrowser(fakeBrowser.runtime, 'getManifest').mockReturnValue({ manifest_version: 2 })
    const backgroundWindow = createWindow({ pathname: '/background.html' })
    vi.stubGlobal('window', backgroundWindow)
    Object.assign(fakeBrowser, { extension: { getBackgroundPage: () => backgroundWindow } })

    expect(isBackgroundContext()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.BACKGROUND)
  })

  it('does not take an extension page for the background page', () => {
    spyOnBrowser(fakeBrowser.runtime, 'getManifest').mockReturnValue({ manifest_version: 2 })
    vi.stubGlobal('window', createWindow({ pathname: '/sidepanel.html' }))
    Object.assign(fakeBrowser, {
      extension: { getBackgroundPage: () => createWindow({ pathname: '/background.html' }) },
    })

    expect(isBackgroundContext()).toBe(false)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SIDEPANEL)
  })

  it('detects side panel context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/sidepanel.html' }))

    expect(isSidePanel()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SIDEPANEL)
  })

  it('detects popup context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/popup.html' }))

    expect(isPopup()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.POPUP)
  })

  it('detects options page context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/options.html' }))

    expect(isOptionsPage()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.OPTIONS)
  })

  it('detects onboarding page context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/onboarding.html' }))

    expect(isOnboardingPage()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.ONBOARDING)
  })

  it('detects full data view context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/full-data-view.html' }))

    expect(isFullDataView()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.FULL_DATA_VIEW)
  })

  it.each(getEntrypointPaths())(
    'detects context other than UNKNOWN for each of the entrypoints in src/entrypoints',
    (path) => {
      vi.stubGlobal('window', createWindow({ pathname: path }))
      expect(getCurrentContext()).not.toBe(EXTENSION_CONTEXTS.UNKNOWN)
    },
  )

  it('returns UNKNOWN context when pathname is not a known extension page', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/not-an-entrypoint.html' }))

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })

  it('returns UNKNOWN context on a web page whose path names an extension page', () => {
    vi.stubGlobal(
      'window',
      createWindow({ pathname: '/sidepanel.html', origin: 'https://example.com' }),
    )

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })

  it("returns UNKNOWN context on another extension's page", () => {
    vi.stubGlobal(
      'window',
      createWindow({
        pathname: '/sidepanel.html',
        origin: 'chrome-extension://someotherextension',
      }),
    )

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })

  it('detects an extension page under a Firefox extension origin', () => {
    const origin = 'moz-extension://0b7c1f2e-5a4d-4e8b-9c3a-1d2e3f4a5b6c'
    spyOnBrowser(fakeBrowser.runtime, 'getURL').mockImplementation(
      (path: string) => `${origin}${path}`,
    )
    vi.stubGlobal('window', createWindow({ pathname: '/full-data-view.html', origin }))

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.FULL_DATA_VIEW)
  })
})
