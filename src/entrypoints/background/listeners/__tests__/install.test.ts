import {
  initializeUninstallUrl,
  setupUninstallUrl,
} from '@/entrypoints/background/listeners/install'
import * as distinctId from '@/utils/distinct-id'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing'
import { storage } from 'wxt/utils/storage'

// Mock dependencies
vi.mock('loglevel', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

describe('setupUninstallUrl', () => {
  let mockSetUninstallURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fakeBrowser.reset()
    // Mock browser.runtime.setUninstallURL
    mockSetUninstallURL = vi.fn().mockResolvedValue(undefined)
    fakeBrowser.runtime.setUninstallURL = mockSetUninstallURL
  })

  it('should read from storage when called with no arguments', async () => {
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    await storage.setItem(distinctId.DISTINCT_ID_KEY, mockDistinctId)
    const getItemSpy = vi.spyOn(storage, 'getItem')

    await setupUninstallUrl()

    expect(getItemSpy).toHaveBeenCalledWith(distinctId.DISTINCT_ID_KEY)
    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      `https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f?distinct_id=${mockDistinctId}`,
    )
  })

  it('should NOT read from storage when called with explicit distinct_id', async () => {
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    const getItemSpy = vi.spyOn(storage, 'getItem')

    await setupUninstallUrl(mockDistinctId)

    expect(getItemSpy).not.toHaveBeenCalled()
    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      `https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f?distinct_id=${mockDistinctId}`,
    )
  })

  it('should NOT read from storage when called with explicit null', async () => {
    const getItemSpy = vi.spyOn(storage, 'getItem')

    await setupUninstallUrl(null)

    expect(getItemSpy).not.toHaveBeenCalled()
    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      'https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f',
    )
  })
})

describe('initializeUninstallUrl', () => {
  let mockSetUninstallURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fakeBrowser.reset()
    // Mock browser.runtime.setUninstallURL
    mockSetUninstallURL = vi.fn().mockResolvedValue(undefined)
    fakeBrowser.runtime.setUninstallURL = mockSetUninstallURL
  })

  it('should set initial uninstall URL with distinct_id when it exists in storage', async () => {
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    await storage.setItem(distinctId.DISTINCT_ID_KEY, mockDistinctId)

    await initializeUninstallUrl()

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      `https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f?distinct_id=${mockDistinctId}`,
    )
  })

  it('should set initial URL without distinct_id when user never opted into tracking', async () => {
    // Don't set distinct_id in storage - simulating a user who never opted in
    await initializeUninstallUrl()

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      'https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f',
    )
  })

  it('should update uninstall URL when distinct_id is added to storage', async () => {
    // Initialize without distinct_id
    await initializeUninstallUrl()

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      'https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f',
    )

    mockSetUninstallURL.mockClear()

    // Simulate user opting in by adding distinct_id
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    await storage.setItem(distinctId.DISTINCT_ID_KEY, mockDistinctId)

    // Wait for watcher to trigger
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      `https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f?distinct_id=${mockDistinctId}`,
    )
  })

  it('should update uninstall URL when distinct_id is removed from storage', async () => {
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    await storage.setItem(distinctId.DISTINCT_ID_KEY, mockDistinctId)

    // Initialize with distinct_id
    await initializeUninstallUrl()

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      `https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f?distinct_id=${mockDistinctId}`,
    )

    mockSetUninstallURL.mockClear()

    // Simulate user opting out by removing distinct_id
    await storage.removeItem(distinctId.DISTINCT_ID_KEY)

    // Wait for watcher to trigger
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockSetUninstallURL).toHaveBeenCalledWith(
      'https://eu.posthog.com/external_surveys/019bc3b5-6482-0000-f2c0-6f95de1b3d4f',
    )
  })

  it('should handle setUninstallURL failures gracefully', async () => {
    const mockDistinctId = '01234567-89ab-cdef-0123-456789abcdef'
    await storage.setItem(distinctId.DISTINCT_ID_KEY, mockDistinctId)
    mockSetUninstallURL.mockRejectedValue(new Error('API error'))

    // Should not throw
    await expect(initializeUninstallUrl()).resolves.not.toThrow()
  })
})
