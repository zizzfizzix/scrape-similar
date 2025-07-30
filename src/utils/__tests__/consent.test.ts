import { ANALYTICS_CONSENT_STORAGE_KEY, getConsentState, setConsent } from '@/utils/consent'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

// Prefix used by consent utilities when interacting with storage
const STORAGE_KEY = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}`

describe('consent utilities', () => {
  beforeEach(() => {
    // Reset the in-memory fake browser before each test run
    fakeBrowser.reset()
  })

  it('returns undefined when consent has not been asked', async () => {
    expect(await getConsentState()).toBeUndefined()
  })

  it('returns undefined when the stored value is an empty string', async () => {
    await storage.setItem(STORAGE_KEY, '')
    expect(await getConsentState()).toBeUndefined()
  })

  it('returns true when consent is stored as true', async () => {
    await storage.setItem(STORAGE_KEY, true)
    expect(await getConsentState()).toBe(true)
  })

  it('returns false when consent is stored as false', async () => {
    await storage.setItem(STORAGE_KEY, false)
    expect(await getConsentState()).toBe(false)
  })

  it('persists the value via setConsent', async () => {
    await setConsent(true)
    expect(await storage.getItem<boolean>(STORAGE_KEY)).toBe(true)
  })
})
