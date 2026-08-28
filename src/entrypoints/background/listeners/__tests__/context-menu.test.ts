import { setupContextMenuListener } from '@/entrypoints/background/listeners/context-menu'
import { getSessionState } from '@/entrypoints/background/services/session-storage'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import type { ScrapeConfig } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { spyOnBrowser } from '@@/tests/support/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

describe('setupContextMenuListener', () => {
  let clickMenu: (
    info: Partial<Browser.contextMenus.OnClickData>,
    tab?: Partial<Browser.tabs.Tab>,
  ) => Promise<void>
  let sendMessage: MockInstance
  let openSidePanel: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    sendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage')
    openSidePanel = spyOnBrowser(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined)
    // fake-browser has no in-memory contextMenus implementation, so capture the
    // registered handler and invoke it directly.
    spyOnBrowser(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(
      (listener) => {
        const handler = listener as (
          info: Partial<Browser.contextMenus.OnClickData>,
          tab?: Partial<Browser.tabs.Tab>,
        ) => Promise<void>
        clickMenu = handler
      },
    )
    setupContextMenuListener()
  })

  /** Reply to each content-script message type with a canned response. */
  const replyWith = (responses: Record<string, unknown>) => {
    sendMessage.mockImplementation((async (_tabId: number, message: { type: string }) => {
      if (!(message.type in responses)) throw new Error(`unexpected message ${message.type}`)
      const response = responses[message.type]
      if (response instanceof Error) throw response
      return response
    }) as never)
  }

  const seedConfig = (tabId: number, value: ScrapeConfig | undefined) =>
    storage.setItem(`session:sidepanel_config_${tabId}`, { currentScrapeConfig: value })

  describe('quick scrape', () => {
    const quickScrape = (info: Partial<Browser.contextMenus.OnClickData> = {}) =>
      clickMenu({ menuItemId: 'scrape-similar', ...info }, { id: 2, url: 'https://example.com' })

    it('opens the panel, highlights, then scrapes using the stored config', async () => {
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 12 },
        [MESSAGE_TYPES.START_SCRAPE]: { success: true },
      })

      await quickScrape({ selectionText: 'Poland' })

      expect(openSidePanel).toHaveBeenCalledWith({ tabId: 2 })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.CONTEXT_MENU_QUICK_SCRAPE, {
        has_selection: true,
      })
      expect(sendMessage).toHaveBeenCalledWith(2, {
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector: '//tr', shouldScroll: false },
      })
      expect(sendMessage).toHaveBeenCalledWith(2, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })
      expect((await getSessionState(2))?.highlightMatchCount).toBe(12)
      expect(trackEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.SCRAPE_INITIATION_FROM_CONTEXT_MENU,
        { has_config: true },
      )
    })

    it('reports no selection when the click carried none', async () => {
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 1 },
        [MESSAGE_TYPES.START_SCRAPE]: { success: true },
      })

      await quickScrape()

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.CONTEXT_MENU_QUICK_SCRAPE, {
        has_selection: false,
      })
    })

    it('continues after a failure to open the side panel', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      openSidePanel.mockRejectedValue(new Error('no user gesture'))
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 1 },
        [MESSAGE_TYPES.START_SCRAPE]: { success: true },
      })

      await quickScrape()

      expect(errorSpy).toHaveBeenCalledWith(
        'Error opening side panel for tab 2:',
        expect.any(Error),
      )
      expect(sendMessage).toHaveBeenCalledWith(2, {
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: config,
      })
    })

    it('aborts when the content script cannot save element details', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: false, error: 'no element' },
      })

      await quickScrape()

      expect(errorSpy).toHaveBeenCalledWith(
        'Error in right-click scrape flow:',
        expect.objectContaining({ message: 'Failed to save element details: no element' }),
      )
    })

    it('reports an unknown error when the save response has no error field', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      replyWith({ [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: {} })

      await quickScrape()

      expect(errorSpy).toHaveBeenCalledWith(
        'Error in right-click scrape flow:',
        expect.objectContaining({
          message: 'Failed to save element details: Unknown error',
        }),
      )
    })

    it('warns and stops when no config is stored for the tab', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
      replyWith({ [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true } })

      await quickScrape()

      expect(warnSpy).toHaveBeenCalledWith(
        'No currentScrapeConfig found in session storage, cannot auto-scrape.',
      )
    })

    it('warns and stops when the stored config has no main selector', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
      await seedConfig(2, { mainSelector: '', columns: [] })
      replyWith({ [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true } })

      await quickScrape()

      expect(warnSpy).toHaveBeenCalledWith(
        'No currentScrapeConfig found in session storage, cannot auto-scrape.',
      )
    })

    it('records the highlight error and skips the scrape when nothing matched', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 0 },
      })

      await quickScrape()

      expect(warnSpy).toHaveBeenCalledWith(
        'Highlight failed or no elements found for selector, aborting scrape.',
      )
      expect((await getSessionState(2))?.highlightMatchCount).toBe(0)
    })

    it('skips the scrape when the highlight reports failure', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: false, matchCount: 3, error: 'bad xpath' },
      })

      await quickScrape()

      expect(warnSpy).toHaveBeenCalledWith(
        'Highlight failed or no elements found for selector, aborting scrape.',
      )
      expect((await getSessionState(2))?.highlightError).toBe('bad xpath')
    })

    it('skips the scrape when the highlight omits a match count', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true },
      })

      await quickScrape()

      expect(warnSpy).toHaveBeenCalledWith(
        'Highlight failed or no elements found for selector, aborting scrape.',
      )
    })

    it('logs when the scrape itself is rejected', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 5 },
        [MESSAGE_TYPES.START_SCRAPE]: { success: false, error: 'boom' },
      })

      await quickScrape()

      expect(errorSpy).toHaveBeenCalledWith(
        'Error in right-click scrape flow:',
        expect.objectContaining({ message: 'Failed to trigger scrape: boom' }),
      )
    })

    it('reports an unknown error when the scrape response has no error field', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      await seedConfig(2, config)
      replyWith({
        [MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE]: { success: true },
        [MESSAGE_TYPES.HIGHLIGHT_ELEMENTS]: { success: true, matchCount: 5 },
        [MESSAGE_TYPES.START_SCRAPE]: undefined,
      })

      await quickScrape()

      expect(errorSpy).toHaveBeenCalledWith(
        'Error in right-click scrape flow:',
        expect.objectContaining({ message: 'Failed to trigger scrape: Unknown error' }),
      )
    })
  })

  describe('visual picker', () => {
    const pickMenu = (tab: Partial<Browser.tabs.Tab>) =>
      clickMenu({ menuItemId: 'scrape-visual-picker' }, tab)

    it('toggles picker mode in the clicked tab', async () => {
      sendMessage.mockResolvedValue(undefined as never)

      await pickMenu({ id: 2, url: 'https://example.com' })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.CONTEXT_MENU_VISUAL_PICKER)
      expect(sendMessage).toHaveBeenCalledWith(2, {
        type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
        payload: { source: 'context_menu' },
      })
    })

    it('refuses to run on a page that cannot host a content script', async () => {
      const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

      await pickMenu({ id: 2, url: 'chrome://settings' })

      expect(warnSpy).toHaveBeenCalledWith(
        'Cannot enable visual picker on non-injectable URL:',
        'chrome://settings',
      )
      expect(sendMessage).not.toHaveBeenCalled()
    })

    it('logs when the content script cannot be reached', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      const failure = new Error('Receiving end does not exist')
      sendMessage.mockRejectedValue(failure)

      await pickMenu({ id: 2, url: 'https://example.com' })

      expect(errorSpy).toHaveBeenCalledWith(
        'Error handling scrape-visual-picker context menu:',
        failure,
      )
    })
  })

  it('ignores a click with no tab', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})

    await clickMenu({ menuItemId: 'scrape-similar' }, undefined)

    expect(errorSpy).toHaveBeenCalledWith('No tab ID available')
    expect(openSidePanel).not.toHaveBeenCalled()
  })

  it('ignores a click on a tab with no id', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})

    await clickMenu({ menuItemId: 'scrape-similar' }, { url: 'https://example.com' })

    expect(errorSpy).toHaveBeenCalledWith('No tab ID available')
  })

  it('ignores menu items it does not own', async () => {
    await clickMenu({ menuItemId: 'some-other-item' }, { id: 2, url: 'https://example.com' })

    expect(openSidePanel).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
