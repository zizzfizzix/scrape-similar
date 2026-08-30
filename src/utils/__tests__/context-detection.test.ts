import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

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

/**
 * A content script has no `browser.tabs`, which is how `isContentScript`
 * recognises one — but the API's own types have `tabs` as always-present, so
 * taking it away needs a view of `browser` that admits it can be missing.
 */
const withOptionalTabs = browser as { tabs?: typeof browser.tabs }

// Preserved so a test that mimics a content script can put `tabs` back.
let originalTabs: typeof browser.tabs | undefined

beforeEach(() => {
  originalTabs = withOptionalTabs.tabs

  // Reset fake browser between tests to clear previous stubs/state
  fakeBrowser.reset()
})

afterEach(() => {
  // Restores every `window` and `self` these tests stubbed.
  vi.unstubAllGlobals()

  if (originalTabs === undefined) {
    delete withOptionalTabs.tabs
  } else {
    withOptionalTabs.tabs = originalTabs
  }

  vi.restoreAllMocks()
})

const createWindow = ({
  protocol = 'chrome-extension:',
  pathname,
}: {
  protocol?: string
  pathname: string
}) => ({
  location: {
    protocol,
    pathname,
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
    delete withOptionalTabs.tabs

    expect(isContentScript()).toBe(true)
    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.CONTENT_SCRIPT)
  })

  it('detects background context', () => {
    vi.stubGlobal('window', undefined)
    if (typeof self === 'undefined') {
      vi.stubGlobal('self', globalThis)
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

  it('returns UNKNOWN context when protocol does not match extension pages', () => {
    // Window exists but protocol and pathname not matching extension pages
    vi.stubGlobal('window', createWindow({ pathname: '/index.html', protocol: 'https:' }))

    expect(getCurrentContext()).toBe(EXTENSION_CONTEXTS.UNKNOWN)
  })
})
