import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing'

import {
  EXTENSION_CONTEXTS,
  getCurrentContext,
  isBackgroundContext,
  isContentScript,
  isDataView,
  isOnboardingPage,
  isOptionsPage,
  isPopup,
  isScrapeDetail,
  isScrapeNew,
  isScrapesList,
  isSidePanel,
} from '@/utils/context-detection'

// Helper to safely restore global objects after each test
let originalWindow: any
let originalTabs: any

beforeEach(() => {
  // Preserve the original globals to restore later
  originalWindow = globalThis.window
  // Preserve the original tabs reference (fakeBrowser adds this)
  originalTabs = (globalThis as any).browser?.tabs

  // Reset fake browser between tests to clear previous stubs/state
  fakeBrowser.reset()
})

afterEach(() => {
  // Restore window
  if (typeof originalWindow === 'undefined') {
    // @ts-ignore - delete to match original absence
    delete (globalThis as any).window
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    globalThis.window = originalWindow
  }

  // Restore tabs property back onto browser if it was modified
  const browserObj = (globalThis as any).browser
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
  protocol = 'chrome-extension:',
  pathname,
  hash = '',
}: {
  protocol?: string
  pathname: string
  hash?: string
}) => ({
  location: {
    protocol,
    pathname,
    hash,
  },
})

const getEntrypointPaths = () => {
  const entrypoints = import.meta.glob('@/entrypoints/**/*.html')
  return Object.keys(entrypoints).map((path) => {
    const filename = path.split('/').pop()!
    if (filename === 'index.html') {
      return `${path.split('/').at(-2)}.html`
    }
    return filename
  })
}

describe('context detection utilities', () => {
  it('detects content script context', () => {
    vi.stubGlobal('window', {})
    // Remove tabs to mimic content script environment
    delete (globalThis as any).browser.tabs

    expect(isContentScript()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.CONTENT_SCRIPT)
  })

  it('detects background context', () => {
    vi.stubGlobal('window', undefined)
    if (typeof (globalThis as any).self === 'undefined') {
      ;(globalThis as any).self = globalThis
    }

    expect(isBackgroundContext()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.BACKGROUND)
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
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/onboarding' }))

    expect(isOnboardingPage()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.ONBOARDING)
  })

  it('detects data view context', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/data/123' }))

    expect(isDataView()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.DATA_VIEW)
  })

  it.each(getEntrypointPaths())(
    'detects context other than UNKNOWN for each of the entrypoints in src/entrypoints',
    (path) => {
      // app.html uses hash-based routing, so we need to provide a hash
      // For other entrypoints, pathname alone is sufficient
      const hash = path === 'app.html' ? '#/onboarding' : ''
      vi.stubGlobal('window', createWindow({ pathname: path, hash }))
      expect(getCurrentContext()).not.toBe(EXTENSION_CONTEXTS.UNKNOWN)
    },
  )

  it('detects onboarding route in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/onboarding' }))

    expect(isOnboardingPage()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.ONBOARDING)
  })

  it('detects data view route in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/data/123' }))

    expect(isDataView()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.DATA_VIEW)
  })

  it('detects scrapes list route in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/scrapes' }))

    expect(isScrapesList()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SCRAPES_LIST)
  })

  it('detects scrape detail route in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/scrapes/abc-123' }))

    expect(isScrapeDetail()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SCRAPE_DETAIL)
  })

  it('detects new scrape route in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/scrapes/new' }))

    expect(isScrapeNew()).toBe(true)
    expect(isScrapeDetail()).toBe(false) // Should not match detail
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SCRAPE_NEW)
  })

  it('detects new scrape route with query params in app.html', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/app.html', hash: '#/scrapes/new?from=abc' }))

    expect(isScrapeNew()).toBe(true)
    expect(isScrapeDetail()).toBe(false)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.SCRAPE_NEW)
  })

  it('returns UNKNOWN context when pathname is not a known extension page', () => {
    vi.stubGlobal('window', createWindow({ pathname: '/not-an-entrypoint.html' }))

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })

  it('returns UNKNOWN context when protocol does not match extension pages', () => {
    // Window exists but protocol and pathname not matching extension pages
    vi.stubGlobal('window', createWindow({ pathname: '/index.html', protocol: 'https:' }))

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })
})
