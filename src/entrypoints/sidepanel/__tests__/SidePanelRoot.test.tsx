// @vitest-environment jsdom
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { type RenderResult, act, render as renderComponent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

const { ConsentProvider } = await import('@/components/consent-provider')
const { SidePanelRoot } = await import('@/entrypoints/sidepanel/SidePanelRoot')

let view: RenderResult

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

/** Give storage watchers a macrotask to fire. */
const flushWatchers = (): Promise<void> => new Promise((resolve) => setTimeout(() => resolve(), 0))

const render = () =>
  renderComponent(
    <ConsentProvider>
      <SidePanelRoot />
    </ConsentProvider>,
  )

/** The settings drawer is portalled, and only shows the switch when debug is on. */
const debugSwitch = () => {
  const found = [...document.querySelectorAll<HTMLElement>('[role="switch"]')].at(-1)
  if (!found) throw new Error('No debug switch rendered')
  return found
}

beforeEach(async () => {
  fakeBrowser.reset()
  modeFlags.isDevOrTest = false
  await storage.setItem(consentKey, true)
  spyOnBrowser(fakeBrowser.tabs, 'query').mockResolvedValue([
    { id: 1, url: 'https://example.com' },
  ] as never)
})

describe('SidePanelRoot', () => {
  it('renders the panel', async () => {
    view = render()
    await act(async () => {})

    expect(view.container.textContent).toContain('Configuration')
  })

  it('logs at trace level in dev or test builds regardless of the flag', async () => {
    modeFlags.isDevOrTest = true
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = render()
    await act(flushWatchers)

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('logs only errors in production builds with debug mode off', async () => {
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = render()
    await act(flushWatchers)

    expect(setLevel).toHaveBeenCalledWith('error')
  })

  it('logs at trace level in production builds with debug mode on', async () => {
    await storage.setItem('local:debugMode', true)
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    view = render()
    await act(flushWatchers)

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('follows the debug flag when it changes elsewhere', async () => {
    view = render()
    // Let the mount-time read settle, so only later changes reach the spy.
    await act(async () => {})
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(setLevel).toHaveBeenCalledWith('trace')
  })

  it('leaves the log level alone on changes in dev or test builds', async () => {
    modeFlags.isDevOrTest = true
    view = render()
    // Let the mount-time read settle, so only later changes reach the spy.
    await act(async () => {})
    const setLevel = vi.spyOn(log, 'setLevel').mockImplementation(() => {})

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(setLevel).not.toHaveBeenCalled()
  })

  it('hands the panel a way to write the flag back', async () => {
    await storage.setItem('local:debugMode', true)
    view = render()
    await act(flushWatchers)

    await userEvent.click(
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!,
    )
    await flushWatchers()
    await act(async () => {
      debugSwitch().click()
      await flushWatchers()
    })

    expect(await storage.getItem('local:debugMode')).toBe(false)
  })

  it('stops listening once unmounted', async () => {
    view = render()
    view.unmount()

    await expect(storage.setItem('local:debugMode', true)).resolves.toBeUndefined()
  })
})
