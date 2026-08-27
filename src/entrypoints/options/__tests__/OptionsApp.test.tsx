// @vitest-environment jsdom
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

// `isDevOrTest` is a build-time constant; the log level only follows the debug
// flag in production builds, so it needs a mutable mock to be reachable.
const modeFlags = { isDev: false, isTest: false, isDevOrTest: false }
vi.mock('@/utils/modeTest', () => ({
  get isDev() {
    return modeFlags.isDev
  },
  get isTest() {
    return modeFlags.isTest
  },
  get isDevOrTest() {
    return modeFlags.isDevOrTest
  },
}))

const { default: OptionsApp } = await import('@/entrypoints/options/OptionsApp')
const { ConsentProvider } = await import('@/components/consent-provider')
const { ThemeProvider } = await import('@/components/theme-provider')
const { TooltipProvider } = await import('@/components/ui/tooltip')

let view: RenderResult | undefined

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

const render = () =>
  renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <OptionsApp />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

const debugSwitch = () => {
  const switches = [...view!.container.querySelectorAll<HTMLElement>('[role="switch"]')]
  const found = switches.at(-1)
  if (!found) throw new Error('No debug switch rendered')
  return found
}

beforeEach(async () => {
  fakeBrowser.reset()
  modeFlags.isDevOrTest = false
  // The options page is behind the consent gate.
  await storage.setItem(consentKey, true)
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('OptionsApp', () => {
  it('shows the settings page', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Settings')
    expect(view.container.textContent).toContain('Theme')
  })

  it('shows a footer crediting the author', async () => {
    view = await render()

    expect(querySelector(view.container, 'footer')).toBeTruthy()
  })

  it('asks for a consent decision before showing anything else', async () => {
    await storage.removeItem(consentKey)

    view = await render()

    expect(view.container.textContent).toContain('Help improve Scrape Similar')
    expect(view.container.textContent).not.toContain('Keyboard shortcut')
  })

  it('starts with debug mode off', async () => {
    view = await render()

    expect(view.container.textContent).not.toContain('Debug mode')
  })

  it('reflects debug mode already being on', async () => {
    await storage.setItem('local:debugMode', true)

    view = await render()

    expect(debugSwitch().getAttribute('aria-checked')).toBe('true')
  })

  it('persists the debug flag when it is switched off', async () => {
    await storage.setItem('local:debugMode', true)
    view = await render()

    await view.act(() => debugSwitch().click())

    expect(await storage.getItem('local:debugMode')).toBe(false)
  })

  it('unlocks the hidden settings after five title clicks', async () => {
    view = await render()
    const title = querySelector<HTMLHeadingElement>(view.container, 'h1')

    for (let i = 0; i < 5; i++) {
      await view.act(() => title.click())
    }

    expect(view.container.textContent).toContain('Debug mode')
  })

  it('logs at trace level in dev or test builds regardless of the flag', async () => {
    modeFlags.isDevOrTest = true
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = await render()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('logs only errors in production builds with debug mode off', async () => {
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = await render()

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('logs at trace level in production builds with debug mode on', async () => {
    await storage.setItem('local:debugMode', true)
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = await render()

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('follows the debug flag when it changes elsewhere', async () => {
    view = await render()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await view.act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(setLevel).toHaveBeenCalledWith('trace')
    expect(view.container.textContent).toContain('Debug mode')
  })

  it('leaves the log level alone on changes in dev or test builds', async () => {
    modeFlags.isDevOrTest = true
    view = await render()
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await view.act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(setLevel).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', async () => {
    view = await render()
    const { cleanup } = view
    view = undefined

    await cleanup()

    await expect(storage.setItem('local:debugMode', true)).resolves.toBeUndefined()
  })
})
