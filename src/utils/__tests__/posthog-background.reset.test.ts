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
  }
  return { PostHog }
})
vi.mock('posthog-js/dist/exception-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/tracing-headers.js', () => ({}))

const { getPostHogBackground, resetPostHogInstance } = await import('@/utils/posthog-background')

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
})
