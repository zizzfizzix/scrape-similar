// @vitest-environment jsdom
import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { renderComponent, type RenderResult } from '@@/tests/support/react'

/**
 * The PostHog API key and host are read from `import.meta.env` at call time but
 * baked into the module graph's imports, so each scenario stubs them and
 * re-imports the provider rather than reusing a single instance.
 */
interface Scenario {
  apiKey?: string
  apiHost?: string
  distinctId?: () => Promise<unknown>
}

const instances: unknown[] = []

const loadProvider = async ({
  apiKey = 'phc_test_key',
  apiHost = 'https://posthog.test',
  distinctId = async () => 'distinct-id',
}: Scenario = {}) => {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', apiKey)
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', apiHost)

  vi.doMock('@/utils/modeTest', () => ({ isDev: false, isTest: true, isDevOrTest: true }))
  vi.doMock('@/utils/consent', () => ({
    ANALYTICS_CONSENT_STORAGE_KEY: 'analytics_consent',
    getConsentState: () => Promise.resolve(true),
    setConsent: () => Promise.resolve(),
  }))
  vi.doMock('@/utils/distinct-id', () => ({ getOrCreateDistinctId: distinctId }))
  for (const bundle of [
    'dead-clicks-autocapture',
    'exception-autocapture',
    'posthog-recorder',
    'surveys',
    'tracing-headers',
    'web-vitals',
  ]) {
    vi.doMock(`posthog-js/dist/${bundle}.js`, () => ({}))
  }
  vi.doMock('posthog-js/dist/module.no-external', () => {
    class PostHog {
      init(_apiKey: string, config: { loaded?: (instance: unknown) => void }) {
        instances.push(this)
        config.loaded?.(this)
      }
    }
    return { PostHog }
  })

  const { PostHogWrapper } = await import('@/components/posthog-provider')
  const { ConsentProvider } = await import('@/components/consent-provider')
  return { PostHogWrapper, ConsentProvider }
}

let view: RenderResult | undefined

const render = async (scenario?: Scenario) => {
  const { PostHogWrapper, ConsentProvider } = await loadProvider(scenario)
  view = await renderComponent(
    <ConsentProvider>
      <PostHogWrapper>
        <p>The app</p>
      </PostHogWrapper>
    </ConsentProvider>,
  )
  await view.act(async () => {})
  return view
}

beforeEach(() => {
  fakeBrowser.reset()
  instances.length = 0
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
  delete (window as { __scrape_similar_posthog?: unknown }).__scrape_similar_posthog
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('PostHogWrapper initialization', () => {
  it('warns and gives up when the API key is missing', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

    await render({ apiKey: '' })

    expect(warnSpy).toHaveBeenCalledWith('PostHog API key not found in environment variables')
    expect(instances).toHaveLength(0)
  })

  it('warns and gives up when the API host is missing', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

    await render({ apiHost: '' })

    expect(warnSpy).toHaveBeenCalledWith('PostHog API host not found in environment variables')
    expect(instances).toHaveLength(0)
  })

  it('logs and gives up when initialization throws', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('no distinct id')

    await render({ distinctId: () => Promise.reject(failure) })

    expect(errorSpy).toHaveBeenCalledWith('Failed to initialize PostHog in UI context:', failure)
    expect(instances).toHaveLength(0)
  })

  it('exposes the instance when the environment is complete', async () => {
    await render()

    expect(instances).toHaveLength(1)
    expect((window as { __scrape_similar_posthog?: unknown }).__scrape_similar_posthog).toBe(
      instances[0],
    )
  })
})
