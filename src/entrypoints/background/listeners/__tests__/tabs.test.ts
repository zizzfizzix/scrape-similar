import {
  setupTabRemovedListener,
  setupTabUpdatedListener,
} from '@/entrypoints/background/listeners/tabs'
import { getSessionState } from '@/entrypoints/background/services/session-storage'
import type { ScrapeConfig } from '@/utils/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const demoMocks = vi.hoisted(() => ({
  clearDemoScrapeFlag: vi.fn(),
  executeDemoScrape: vi.fn(),
}))
vi.mock('@/entrypoints/background/services/demo-scrape', () => demoMocks)

const demoConfig: ScrapeConfig = { mainSelector: '//tr', columns: [] }

describe('setupTabRemovedListener', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    demoMocks.clearDemoScrapeFlag.mockResolvedValue(undefined)
    setupTabRemovedListener()
  })

  it('clears both the session state and the pending demo flag', async () => {
    await storage.setItem('session:sidepanel_config_4', { initialSelectionText: 'x' })

    await fakeBrowser.tabs.onRemoved.trigger(4, { windowId: 1, isWindowClosing: false })

    expect(await getSessionState(4)).toBeNull()
    expect(demoMocks.clearDemoScrapeFlag).toHaveBeenCalledWith(4)
  })
})

describe('setupTabUpdatedListener', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    demoMocks.clearDemoScrapeFlag.mockResolvedValue(undefined)
    demoMocks.executeDemoScrape.mockResolvedValue(undefined)
    setupTabUpdatedListener()
  })

  const update = (changeInfo: Browser.tabs.OnUpdatedInfo, tab: Partial<Browser.tabs.Tab>) =>
    fakeBrowser.tabs.onUpdated.trigger(3, changeInfo, tab as Browser.tabs.Tab)

  it('runs the pending demo scrape once the Wikipedia article finishes loading', async () => {
    await storage.setItem('local:demo_scrape_pending_3', demoConfig)

    await update({ status: 'complete' }, { url: 'https://en.wikipedia.org/wiki/Foo' })

    expect(demoMocks.clearDemoScrapeFlag).toHaveBeenCalledWith(3)
    expect(demoMocks.executeDemoScrape).toHaveBeenCalledWith(3, demoConfig)
  })

  it('waits for the load to complete', async () => {
    await storage.setItem('local:demo_scrape_pending_3', demoConfig)

    await update({ status: 'loading' }, { url: 'https://en.wikipedia.org/wiki/Foo' })

    expect(demoMocks.executeDemoScrape).not.toHaveBeenCalled()
  })

  it('does nothing when no demo scrape is pending for the tab', async () => {
    await update({ status: 'complete' }, { url: 'https://en.wikipedia.org/wiki/Foo' })

    expect(demoMocks.executeDemoScrape).not.toHaveBeenCalled()
  })

  it('does not fire on a page outside the Wikipedia article namespace', async () => {
    await storage.setItem('local:demo_scrape_pending_3', demoConfig)

    await update({ status: 'complete' }, { url: 'https://example.com' })

    expect(demoMocks.executeDemoScrape).not.toHaveBeenCalled()
  })

  it('does not fire when the tab reports no URL', async () => {
    await storage.setItem('local:demo_scrape_pending_3', demoConfig)

    await update({ status: 'complete' }, {})

    expect(demoMocks.executeDemoScrape).not.toHaveBeenCalled()
  })
})
