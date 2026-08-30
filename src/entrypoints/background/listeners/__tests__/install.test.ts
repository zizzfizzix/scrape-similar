import {
  initializeUninstallUrl,
  setupInstallListener,
  setupStartupListener,
  setupUninstallUrl,
} from '@/entrypoints/background/listeners/install'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import * as distinctId from '@/utils/distinct-id'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

/** fake-browser has no in-memory manifest, and content-script injection reads it. */
const stubManifest = () =>
  spyOnBrowser(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    manifest_version: 3,
    name: 'Scrape Similar',
    version: '0.0.0',
    content_scripts: [{ js: ['content.js'] }],
  } as never)

describe('setupUninstallUrl', () => {
  let mockSetUninstallURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fakeBrowser.reset()
    // Mock browser.runtime.setUninstallURL
    mockSetUninstallURL = vi.fn().mockResolvedValue(undefined)
    // setUninstallURL is declared with both promise and callback overloads, so a
    // single-signature mock is not directly assignable to it.
    fakeBrowser.runtime.setUninstallURL =
      mockSetUninstallURL as unknown as typeof fakeBrowser.runtime.setUninstallURL
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
    // setUninstallURL is declared with both promise and callback overloads, so a
    // single-signature mock is not directly assignable to it.
    fakeBrowser.runtime.setUninstallURL =
      mockSetUninstallURL as unknown as typeof fakeBrowser.runtime.setUninstallURL
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

describe('setupInstallListener', () => {
  let create: MockInstance
  let setPanelBehavior: MockInstance

  beforeEach(() => {
    vi.clearAllMocks()
    fakeBrowser.reset()
    create = spyOnBrowser(fakeBrowser.tabs, 'create').mockResolvedValue({} as Browser.tabs.Tab)
    setPanelBehavior = vi
      .spyOn(fakeBrowser.sidePanel, 'setPanelBehavior')
      .mockResolvedValue(undefined)
    spyOnBrowser(fakeBrowser.contextMenus, 'create').mockImplementation(() => {})
    spyOnBrowser(fakeBrowser.scripting, 'executeScript').mockResolvedValue([])
    stubManifest()
    setupInstallListener()
  })

  const install = (reason: 'install' | 'update') =>
    fakeBrowser.runtime.onInstalled.trigger({
      reason,
    } as Browser.runtime.InstalledDetails)

  it('opens onboarding, registers menus and configures the panel on a fresh install', async () => {
    await install('install')

    expect(create).toHaveBeenCalledWith({
      url: fakeBrowser.runtime.getURL('/onboarding.html'),
      active: true,
    })
    expect(fakeBrowser.contextMenus.create).toHaveBeenCalledTimes(2)
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true })
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXTENSION_INSTALLATION)
  })

  it('does not reopen onboarding on an update', async () => {
    await install('update')

    expect(create).not.toHaveBeenCalled()
    expect(setPanelBehavior).toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXTENSION_INSTALLATION)
  })

  it('continues when the onboarding tab cannot be opened', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('no window')
    create.mockRejectedValue(failure)

    await install('install')

    expect(errorSpy).toHaveBeenCalledWith('Error opening onboarding page:', failure)
    expect(setPanelBehavior).toHaveBeenCalled()
  })

  it('continues when the panel behaviour cannot be set', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('unsupported')
    setPanelBehavior.mockRejectedValue(failure)

    await install('update')

    expect(errorSpy).toHaveBeenCalledWith('Error setting side panel behavior:', failure)
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.EXTENSION_INSTALLATION)
  })
})

describe('setupStartupListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeBrowser.reset()
    spyOnBrowser(fakeBrowser.scripting, 'executeScript').mockResolvedValue([])
    stubManifest()
    setupStartupListener()
  })

  it('re-injects the content script into every eligible tab', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' })

    await fakeBrowser.runtime.onStartup.trigger()

    expect(fakeBrowser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ['content.js'],
    })
  })
})
