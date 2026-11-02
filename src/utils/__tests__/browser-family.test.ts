import { BROWSER_FAMILIES, getBrowserFamily } from '@/utils/browser-family'
import { afterEach, describe, expect, it, vi } from 'vitest'

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const EDGE_UA = `${CHROME_UA} Edg/130.0.0.0`

const stubUserAgent = (userAgent: string) => vi.stubGlobal('navigator', { ...navigator, userAgent })

describe('getBrowserFamily', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reports Chrome for the Chromium build in Chrome', () => {
    stubUserAgent(CHROME_UA)

    expect(getBrowserFamily()).toBe(BROWSER_FAMILIES.CHROME)
  })

  it('reports Edge for the Chromium build in Edge', () => {
    stubUserAgent(EDGE_UA)

    expect(getBrowserFamily()).toBe(BROWSER_FAMILIES.EDGE)
  })

  it('reports Firefox for the Firefox build', () => {
    vi.stubEnv('FIREFOX', true as never)

    expect(getBrowserFamily()).toBe(BROWSER_FAMILIES.FIREFOX)
  })
})
