// @vitest-environment jsdom
import themeBoot from '@/entrypoints/theme-boot/index'
import {
  applyThemeMirror,
  isTheme,
  resolveTheme,
  THEME_MIRROR_KEY,
  writeThemeMirror,
} from '@/utils/theme-mirror'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const preferDark = (isDarkPreferred: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockReturnValue({ matches: isDarkPreferred } as unknown as MediaQueryList)

/** jsdom's origin is not the extension's, so a test that writes claims it. */
const runAsExtensionPage = () =>
  spyOnBrowser(fakeBrowser.runtime, 'getURL').mockReturnValue(`${location.origin}/`)

beforeEach(() => {
  fakeBrowser.reset()
  localStorage.clear()
  document.documentElement.className = ''
})

describe('isTheme', () => {
  it.each(['light', 'dark', 'system'])('accepts %s', (value) => {
    expect(isTheme(value)).toBe(true)
  })

  it.each(['neon', null, 1])('rejects %s', (value) => {
    expect(isTheme(value)).toBe(false)
  })
})

describe('resolveTheme', () => {
  it('keeps a chosen theme', () => {
    preferDark(true)

    expect(resolveTheme('light')).toBe('light')
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ])('follows the system when it prefers dark: %s', (isDarkPreferred, expected) => {
    preferDark(isDarkPreferred)

    expect(resolveTheme('system')).toBe(expected)
  })
})

describe('writeThemeMirror', () => {
  it('copies the theme on an extension page', () => {
    runAsExtensionPage()

    writeThemeMirror('dark')

    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe('dark')
  })

  it('leaves the storage of a page a content script runs on alone', () => {
    writeThemeMirror('dark')

    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBeNull()
  })

  it('warns instead of throwing when the copy cannot be written', () => {
    runAsExtensionPage()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})

    writeThemeMirror('dark')

    expect(warn).toHaveBeenCalledWith('Could not mirror the theme', expect.any(Error))
  })
})

describe('applyThemeMirror', () => {
  it('applies the mirrored theme to the document', () => {
    preferDark(false)
    localStorage.setItem(THEME_MIRROR_KEY, 'dark')

    applyThemeMirror()

    expect(document.documentElement.className).toBe('dark')
  })

  it('resolves a mirrored system theme', () => {
    preferDark(true)
    localStorage.setItem(THEME_MIRROR_KEY, 'system')

    applyThemeMirror()

    expect(document.documentElement.className).toBe('dark')
  })

  it.each([
    ['nothing is mirrored', null],
    ['the copy is not a theme', 'neon'],
  ])('follows the system when %s', (_, stored) => {
    preferDark(true)
    if (stored !== null) localStorage.setItem(THEME_MIRROR_KEY, stored)

    applyThemeMirror()

    expect(document.documentElement.className).toBe('dark')
  })

  it('follows the system when the copy cannot be read', () => {
    preferDark(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})

    applyThemeMirror()

    expect(document.documentElement.className).toBe('dark')
    expect(warn).toHaveBeenCalledWith('Could not read the mirrored theme', expect.any(Error))
  })
})

describe('theme-boot', () => {
  it('applies the mirrored theme when it runs', () => {
    preferDark(false)
    localStorage.setItem(THEME_MIRROR_KEY, 'dark')

    themeBoot.main()

    expect(document.documentElement.className).toBe('dark')
  })
})
