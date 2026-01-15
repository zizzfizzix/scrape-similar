// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

// ------------------------- Mocks -------------------------
// Mock PostHog core implementation and record the supplied distinct id
vi.mock('posthog-js/dist/module.no-external', () => {
  class MockPostHog {
    private _distinctId: string | null = null

    init(_apiKey: string, options: any) {
      this._distinctId = options?.bootstrap?.distinctID ?? null
      // Call the loaded callback immediately to mimic PostHog behaviour
      options?.loaded?.(this)
    }

    get_distinct_id() {
      return this._distinctId
    }

    capture() {}
  }

  return { PostHog: MockPostHog }
})

// Stub out side-effect-only PostHog bundles
vi.mock('posthog-js/dist/dead-clicks-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/exception-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/posthog-recorder.js', () => ({}))
vi.mock('posthog-js/dist/surveys.js', () => ({}))
vi.mock('posthog-js/dist/tracing-headers.js', () => ({}))
vi.mock('posthog-js/dist/web-vitals.js', () => ({}))

// Force analytics consent to granted so PostHog initialisation proceeds
vi.mock('@/components/consent-provider', () => ({
  useConsent: () => ({ loading: false, state: true, setConsent: async () => {} }),
}))

// ------------------------- Imports -------------------------
import { PostHogWrapper } from '@/components/posthog-provider'
import * as consent from '@/utils/consent'
import * as distinctId from '@/utils/distinct-id'
import { getPostHogBackground } from '@/utils/posthog-background'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// ------------------------- Tests -------------------------
describe('PostHog distinct id consistency', () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    // Default consent behaviour for these tests is granted
    vi.spyOn(consent, 'getConsentState').mockResolvedValue(true)
    vi.spyOn(distinctId, 'getOrCreateDistinctId').mockResolvedValue('test-uuid-21415341242342')
  })

  afterEach(async () => {
    await storage.removeItem(distinctId.DISTINCT_ID_KEY)
  })

  it('uses the same distinct id across background and helper retrieval', async () => {
    const bgPosthog = await getPostHogBackground()
    expect(bgPosthog).not.toBeNull()

    const bgDistinctId = bgPosthog!.get_distinct_id()
    expect(bgDistinctId).toBeTruthy()

    const helperDistinctId = await getOrCreateDistinctId()
    expect(helperDistinctId).toEqual(bgDistinctId)
  })

  it('window.__scrape_similar_posthog has the same distinct id in UI context', async () => {
    delete (globalThis as any).window?.__scrape_similar_posthog

    const bgPosthog = await getPostHogBackground()
    // Distinct id should now be persisted in storage
    const persistedDistinctId = await getOrCreateDistinctId()
    expect(bgPosthog).not.toBeNull()
    expect(bgPosthog!.get_distinct_id()).toEqual(persistedDistinctId)

    // Mount a minimal UI with the PostHog wrapper
    const container = document.createElement('div')
    document.body.appendChild(container)

    await act(async () => {
      const root = createRoot(container)
      root.render(
        <PostHogWrapper>
          <div />
        </PostHogWrapper>,
      )
    })

    const uiPosthog = (globalThis as any).window.__scrape_similar_posthog
    expect(uiPosthog).toBeTruthy()
    expect(uiPosthog.get_distinct_id()).toEqual(persistedDistinctId)
  })
})
