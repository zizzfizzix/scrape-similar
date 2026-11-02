import { afterEach, describe, expect, it, vi } from 'vitest'

import { getInjectableUrlPattern, isInjectableUrl } from '@/utils/isInjectableUrl'

// Test data covering both injectable and non-injectable scenarios
const NON_INJECTABLE_CASES: Array<{ url: string; pattern: string }> = [
  { url: 'chrome://settings', pattern: 'chrome://' },
  { url: 'chrome://extensions', pattern: 'chrome://' },
  { url: 'edge://settings', pattern: 'edge://' },
  { url: 'about:blank', pattern: 'about:' },
  {
    url: 'moz-extension://0b7c1f2e-5a4d-4e8b-9c3a-1d2e3f4a5b6c/options.html',
    pattern: 'moz-extension://',
  },
  {
    url: 'chrome-extension://ibamcdbhdohmndghmidginmpggcjmeob/options.html',
    pattern: 'chrome-extension://',
  },
  {
    url: 'https://chromewebstore.google.com/detail/docsafterdark/pihphjfnfjmdbhakhjifipfdgbpenobg',
    pattern: 'https://chromewebstore.google.com/',
  },
  { url: 'view-source:https://example.com/', pattern: 'view-source:' },
  { url: 'data:text/html,<p>hi</p>', pattern: 'data:' },
  { url: 'blob:https://example.com/0b7c1f2e', pattern: 'blob:' },
  { url: 'devtools://devtools/bundled/inspector.html', pattern: 'devtools://' },
  { url: 'resource://gre/modules/', pattern: 'resource://' },
  { url: 'file:///Users/me/page.html', pattern: 'file://' },
  { url: 'not a url', pattern: 'not a url' },
  {
    url: 'https://chrome.google.com/webstore/detail/ibamcdbhdohmndghmidginmpggcjmeob',
    pattern: '^https://chrome\\.google\\.com/(.+/)?webstore/',
  },
  {
    url: 'https://chrome.google.com/webstore/detail/toolbar-spacer/golladjmjodbefcoombodcdhimkmgemd?hl=Ar',
    pattern: '^https://chrome\\.google\\.com/(.+/)?webstore/',
  },
]

const FIREFOX_NON_INJECTABLE_CASES: Array<{ url: string; pattern: string }> = [
  {
    url: 'https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/',
    pattern: 'https://addons.mozilla.org/',
  },
  {
    url: 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts',
    pattern: 'https://support.mozilla.org/',
  },
  { url: 'https://accounts.firefox.com/signin', pattern: 'https://accounts.firefox.com/' },
  { url: 'about:addons', pattern: 'about:' },
]

const INJECTABLE_CASES = [
  'https://example.com',
  'http://localhost:3000',
  'https://www.google.com',
  'https://docs.google.com/document/d/12345',
  'https://developer.chrome.com/docs/extensions/whats-new',
  'https://chrome.google.com/abc/other/12345',
]

describe('isInjectableUrl', () => {
  it('returns false when called without arguments', () => {
    expect(isInjectableUrl()).toBe(false)
  })

  it.each(NON_INJECTABLE_CASES)('returns false for non-injectable URL: %s', ({ url }) => {
    expect(isInjectableUrl(url)).toBe(false)
  })

  it.each(INJECTABLE_CASES)('returns true for injectable URL: %s', (url) => {
    expect(isInjectableUrl(url)).toBe(true)
  })
})

describe('getInjectableUrlPattern', () => {
  it('returns null when called without arguments', () => {
    expect(getInjectableUrlPattern()).toBeNull()
  })

  it.each(NON_INJECTABLE_CASES)(
    'returns matching pattern for non-injectable URL: %s',
    ({ url, pattern }) => {
      expect(getInjectableUrlPattern(url)).toBe(pattern)
    },
  )

  it.each(INJECTABLE_CASES)('returns null for injectable URL: %s', (url) => {
    expect(getInjectableUrlPattern(url)).toBeNull()
  })
})

describe('on Firefox', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(FIREFOX_NON_INJECTABLE_CASES)('refuses %s', ({ url, pattern }) => {
    vi.stubEnv('FIREFOX', true as never)

    expect(isInjectableUrl(url)).toBe(false)
    expect(getInjectableUrlPattern(url)).toBe(pattern)
  })

  it('injects into the Chrome Web Store, which Firefox does not restrict', () => {
    vi.stubEnv('FIREFOX', true as never)

    expect(isInjectableUrl('https://chromewebstore.google.com/detail/x')).toBe(true)
  })
})

describe('in Chrome', () => {
  it("injects into Firefox's restricted domains and Edge's store, which Chrome does not restrict", () => {
    expect(isInjectableUrl('https://support.mozilla.org/')).toBe(true)
    expect(isInjectableUrl('https://addons.mozilla.org/')).toBe(true)
    expect(isInjectableUrl('https://microsoftedge.microsoft.com/addons/detail/x')).toBe(true)
  })
})

describe('in Edge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      url: 'https://microsoftedge.microsoft.com/addons/detail/odfafepnkmbhccpbejgmiehpchacaeak',
      pattern: 'https://microsoftedge.microsoft.com/addons/',
    },
    {
      url: 'https://chromewebstore.google.com/detail/x',
      pattern: 'https://chromewebstore.google.com/',
    },
  ])('refuses $url', ({ url, pattern }) => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 Chrome/130.0.0.0 Edg/130.0.0.0',
    })

    expect(isInjectableUrl(url)).toBe(false)
    expect(getInjectableUrlPattern(url)).toBe(pattern)
  })
})
