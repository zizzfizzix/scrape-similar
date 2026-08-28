// @vitest-environment jsdom
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { renderComponent, type RenderResult } from '@@/tests/support/react'

/** A PostHog stand-in that records how it was configured. */
const posthogMock = vi.hoisted(() => {
  const instances: Array<{ init: ReturnType<typeof vi.fn>; set_config: ReturnType<typeof vi.fn> }> =
    []
  class PostHog {
    init = vi.fn((_apiKey: string, config: { loaded?: (instance: unknown) => void }) => {
      config.loaded?.(this)
    })
    set_config = vi.fn()
    capture = vi.fn()
    constructor() {
      instances.push(this)
    }
  }
  return { PostHog, instances }
})
vi.mock('posthog-js/dist/module.no-external', () => ({ PostHog: posthogMock.PostHog }))
vi.mock('posthog-js/dist/dead-clicks-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/exception-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/posthog-recorder.js', () => ({}))
vi.mock('posthog-js/dist/surveys.js', () => ({}))
vi.mock('posthog-js/dist/tracing-headers.js', () => ({}))
vi.mock('posthog-js/dist/web-vitals.js', () => ({}))

// `isDevOrTest` is a build-time constant; the debug-mode watcher only runs in
// production builds, so it needs a mutable mock to be reachable.
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

const { PostHogWrapper, resetPostHogUI } = await import('@/components/posthog-provider')
const { ConsentProvider } = await import('@/components/consent-provider')

let view: RenderResult | undefined

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

const exposedInstance = () =>
  (window as { __scrape_similar_posthog?: unknown }).__scrape_similar_posthog

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

const render = () =>
  renderComponent(
    <ConsentProvider>
      <PostHogWrapper>
        <p data-testid="child">The app</p>
      </PostHogWrapper>
    </ConsentProvider>,
  )

beforeEach(() => {
  fakeBrowser.reset()
  posthogMock.instances.length = 0
  modeFlags.isDevOrTest = false
  resetPostHogUI()
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  resetPostHogUI()
  document.body.innerHTML = ''
})

describe('PostHogWrapper', () => {
  it('renders its children', async () => {
    view = await render()

    expect(view.container.textContent).toBe('The app')
  })

  it('does not initialise while consent is undecided', async () => {
    view = await render()

    expect(posthogMock.instances).toHaveLength(0)
    expect(exposedInstance()).toBeUndefined()
  })

  it('does not initialise once consent is declined', async () => {
    await storage.setItem(consentKey, false)

    view = await render()

    expect(posthogMock.instances).toHaveLength(0)
  })

  it('initialises and exposes the instance once consent is granted', async () => {
    await storage.setItem(consentKey, true)

    view = await render()
    await view.act(async () => {})

    expect(posthogMock.instances).toHaveLength(1)
    expect(exposedInstance()).toBe(posthogMock.instances[0])
  })

  it('supplies the shared distinct id so contexts agree on the user', async () => {
    await storage.setItem(consentKey, true)
    await storage.setItem('local:distinct_id', '0198d5f0-0000-7000-8000-000000000000')

    view = await render()
    await view.act(async () => {})

    const [, config] = posthogMock.instances[0]!.init.mock.calls[0] as [
      string,
      { bootstrap: { distinctID: string } },
    ]
    expect(config.bootstrap.distinctID).toBe('0198d5f0-0000-7000-8000-000000000000')
  })

  it('masks redacted elements from session replay', async () => {
    await storage.setItem(consentKey, true)

    view = await render()
    await view.act(async () => {})

    const [, config] = posthogMock.instances[0]!.init.mock.calls[0] as [
      string,
      { session_recording: { maskTextSelector: string } },
    ]
    expect(config.session_recording.maskTextSelector).toBe('.ph_hidden')
  })

  it('does not initialise a second instance for the same consent', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})

    await view.act(async () => {
      await storage.setItem(consentKey, true)
      await flushWatchers()
    })

    expect(posthogMock.instances).toHaveLength(1)
  })

  it('withdraws the instance when consent is revoked', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})

    await view.act(async () => {
      await storage.setItem(consentKey, false)
      await flushWatchers()
    })

    expect(exposedInstance()).toBeUndefined()
  })

  it('withdraws the instance when the decision is cleared', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})

    await view.act(async () => {
      await storage.removeItem(consentKey)
      await flushWatchers()
    })

    expect(exposedInstance()).toBeUndefined()
  })

  it('withdraws the instance on unmount', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})
    const { cleanup } = view
    view = undefined

    await cleanup()

    expect(exposedInstance()).toBeUndefined()
  })

  it('keeps the debug flag in step with storage in production builds', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})
    const instance = posthogMock.instances[0]!
    instance.set_config.mockClear()

    await view.act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(instance.set_config).toHaveBeenCalledWith({ debug: true })
  })

  it('ignores debug-mode changes while no instance exists', async () => {
    view = await render()

    await view.act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(posthogMock.instances).toHaveLength(0)
  })

  it('does not watch debug mode in dev or test builds', async () => {
    modeFlags.isDevOrTest = true
    const watch = vi.spyOn(storage, 'watch')

    view = await render()

    expect(watch).not.toHaveBeenCalledWith('local:debugMode', expect.anything())
  })
})

describe('resetPostHogUI', () => {
  it('removes an exposed instance', async () => {
    await storage.setItem(consentKey, true)
    view = await render()
    await view.act(async () => {})

    resetPostHogUI()

    expect(exposedInstance()).toBeUndefined()
  })

  it('does nothing when there is no instance', () => {
    const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {})

    resetPostHogUI()

    expect(debugSpy).not.toHaveBeenCalledWith('PostHog UI instance reset due to consent revocation')
  })

  it('ignores a foreign object left on the window', () => {
    ;(window as { __scrape_similar_posthog?: unknown }).__scrape_similar_posthog = {
      notPostHog: true,
    }

    resetPostHogUI()

    // Only an instance this provider created is cleared.
    expect(exposedInstance()).toEqual({ notPostHog: true })
    delete (window as { __scrape_similar_posthog?: unknown }).__scrape_similar_posthog
  })
})
