import { ANALYTICS_CONSENT_STORAGE_KEY, getConsentState, setConsent } from '@/utils/consent'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
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

  it('returns undefined and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(failure)

    expect(await getConsentState()).toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Failed to get consent state from storage:', failure)
  })

  it('logs and rethrows when the write fails', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(failure)

    await expect(setConsent(true)).rejects.toThrow(failure)
    expect(errorSpy).toHaveBeenCalledWith('Failed to set consent in storage:', failure)
  })
})
