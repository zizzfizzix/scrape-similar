import * as consent from '@/utils/consent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

// Stub out the PostHog bundles: only the instance lifecycle is under test here.
vi.mock('posthog-js/dist/module.no-external', () => {
  let created = 0
  class PostHog {
    readonly instanceNumber = ++created
    init() {}
    set_config() {}
    capture() {}
    stopExceptionAutocapture = vi.fn()
  }
  return { PostHog }
})
vi.mock('posthog-js/dist/exception-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/tracing-headers.js', () => ({}))

const { currentPostHogBackground, getPostHogBackground, resetPostHogInstance } =
  await import('@/utils/posthog-background')
const { PostHog } = await import('posthog-js/dist/module.no-external')

describe('getPostHogBackground', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    resetPostHogInstance()
  })

  it('returns null while consent is undecided', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)

    expect(await getPostHogBackground()).toBeNull()
  })

  it('returns null once consent is declined', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(false)

    expect(await getPostHogBackground()).toBeNull()
  })

  it('reuses the same instance across calls', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)

    const first = await getPostHogBackground()
    const second = await getPostHogBackground()

    expect(first).not.toBeNull()
    expect(second).toBe(first)
  })

  it('shares one instance between concurrent callers', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)

    const [first, second] = await Promise.all([getPostHogBackground(), getPostHogBackground()])

    expect(second).toBe(first)
  })
})

describe('resetPostHogInstance', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    resetPostHogInstance()
  })

  it('forces a fresh instance on the next call', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    const first = await getPostHogBackground()

    resetPostHogInstance()
    const second = await getPostHogBackground()

    expect(second).not.toBe(first)
  })

  it('lets a revoked consent take effect immediately', async () => {
    const consentSpy = vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    expect(await getPostHogBackground()).not.toBeNull()

    resetPostHogInstance()
    consentSpy.mockResolvedValue(false)

    expect(await getPostHogBackground()).toBeNull()
  })

  it('reports the held instance without initialising one', async () => {
    const consentSpy = vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    expect(currentPostHogBackground()).toBeNull()
    expect(consentSpy).not.toHaveBeenCalled()

    const instance = await getPostHogBackground()

    expect(currentPostHogBackground()).toBe(instance)
  })

  it('stops the exception capture of the instance it drops', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    const instance = (await getPostHogBackground()) as unknown as {
      stopExceptionAutocapture: () => void
    }

    resetPostHogInstance()

    expect(instance.stopExceptionAutocapture).toHaveBeenCalled()
  })

  it('never initialises an instance whose initialisation a reset overtook', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    const initSpy = vi.spyOn(PostHog.prototype, 'init')

    const initialising = getPostHogBackground()
    resetPostHogInstance()

    expect(await initialising).toBeNull()
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('retires an instance a reset overtook once it was built', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    const initSpy = vi.spyOn(PostHog.prototype, 'init').mockImplementation(function (
      this: InstanceType<typeof PostHog>,
    ) {
      resetPostHogInstance()
      return this
    })

    expect(await getPostHogBackground()).toBeNull()

    const retired = initSpy.mock.contexts[0] as unknown as { stopExceptionAutocapture: () => void }
    expect(retired.stopExceptionAutocapture).toHaveBeenCalled()
  })

  it('resolves null when a reset overtakes an initialisation that found no consent', async () => {
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(undefined)

    const initialising = getPostHogBackground()
    resetPostHogInstance()

    expect(await initialising).toBeNull()
  })
})
