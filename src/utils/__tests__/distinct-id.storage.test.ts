import {
  DISTINCT_ID_KEY,
  generateDistinctId,
  getOrCreateDistinctId,
  type DistinctId,
} from '@/utils/distinct-id'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('generateDistinctId', () => {
  it('returns a UUIDv7, matching PostHog’s distinct_id format', () => {
    expect(String(generateDistinctId())).toMatch(UUID_V7)
  })

  it('returns a different id on every call', () => {
    expect(generateDistinctId()).not.toEqual(generateDistinctId())
  })
})

describe('getOrCreateDistinctId', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('creates and persists an id when none is stored', async () => {
    const created = await getOrCreateDistinctId()

    expect(String(created)).toMatch(UUID_V7)
    expect(await storage.getItem<DistinctId>(DISTINCT_ID_KEY)).toEqual(created)
  })

  it('returns the stored id on subsequent calls', async () => {
    const first = await getOrCreateDistinctId()

    expect(await getOrCreateDistinctId()).toEqual(first)
  })

  it('reuses an id written directly to storage', async () => {
    await storage.setItem(DISTINCT_ID_KEY, '0198d5f0-0000-7000-8000-000000000000')

    expect(await getOrCreateDistinctId()).toBe('0198d5f0-0000-7000-8000-000000000000')
  })

  it('falls back to a fresh id when storage is unreadable', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(failure)

    const created = await getOrCreateDistinctId()

    expect(String(created)).toMatch(UUID_V7)
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to access storage for distinct_id, generating a new one',
      failure,
    )
  })

  it('falls back to a fresh id when storage cannot be written', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {})
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('quota exceeded'))

    expect(String(await getOrCreateDistinctId())).toMatch(UUID_V7)
  })
})
