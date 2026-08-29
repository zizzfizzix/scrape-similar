import log from 'loglevel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

/**
 * The environment variables and the `isDevOrTest` flag are both read at module
 * scope, so each scenario re-imports `posthog-background` after stubbing them
 * rather than reusing a single instance.
 */
interface Scenario {
  apiKey?: string
  apiHost?: string
  isDevOrTest?: boolean
  distinctId?: () => Promise<unknown>
}

const setConfigCalls: Record<string, unknown>[] = []

const loadModule = async ({
  apiKey = 'phc_test_key',
  apiHost = 'https://posthog.test',
  isDevOrTest = true,
  distinctId = async () => 'distinct-id',
}: Scenario = {}) => {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', apiKey)
  vi.stubEnv('VITE_PUBLIC_POSTHOG_HOST', apiHost)

  vi.doMock('@/utils/modeTest', () => ({
    isDev: false,
    isTest: isDevOrTest,
    isDevOrTest,
  }))
  vi.doMock('@/utils/consent', () => ({ getConsentState: () => Promise.resolve(true) }))
  vi.doMock('@/utils/distinct-id', () => ({ getOrCreateDistinctId: distinctId }))
  vi.doMock('posthog-js/dist/exception-autocapture.js', () => ({}))
  vi.doMock('posthog-js/dist/tracing-headers.js', () => ({}))
  vi.doMock('posthog-js/dist/module.no-external', () => {
    class PostHog {
      init() {}
      set_config(config: Record<string, unknown>) {
        setConfigCalls.push(config)
      }
    }
    return { PostHog }
  })

  return import('@/utils/posthog-background')
}

beforeEach(() => {
  fakeBrowser.reset()
  setConfigCalls.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@/utils/modeTest')
  vi.doUnmock('@/utils/consent')
  vi.doUnmock('@/utils/distinct-id')
})

describe('getPostHogBackground initialization', () => {
  it('returns null and warns when the API key is missing', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const { getPostHogBackground } = await loadModule({ apiKey: '' })

    expect(await getPostHogBackground()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      'PostHog API key not found in environment variables for background script',
    )
  })

  it('returns null and warns when the API host is missing', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const { getPostHogBackground } = await loadModule({ apiHost: '' })

    expect(await getPostHogBackground()).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      'PostHog API host not found in environment variables for background script',
    )
  })

  it('returns null and logs when initialization throws', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('no distinct id')
    const { getPostHogBackground } = await loadModule({
      distinctId: () => Promise.reject(failure),
    })

    expect(await getPostHogBackground()).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith('Failed to initialize PostHog in background:', failure)
  })

  it('keeps the debug config in sync with storage in production builds', async () => {
    const { getPostHogBackground } = await loadModule({ isDevOrTest: false })

    expect(await getPostHogBackground()).not.toBeNull()

    await storage.setItem('local:debugMode', true)
    expect(setConfigCalls).toContainEqual({ debug: true })

    await storage.setItem('local:debugMode', false)
    expect(setConfigCalls).toContainEqual({ debug: false })
  })

  it('does not watch debugMode in dev or test builds', async () => {
    const watchSpy = vi.spyOn(storage, 'watch')
    const { getPostHogBackground } = await loadModule({ isDevOrTest: true })

    await getPostHogBackground()

    expect(watchSpy).not.toHaveBeenCalledWith('local:debugMode', expect.anything())
  })
})
