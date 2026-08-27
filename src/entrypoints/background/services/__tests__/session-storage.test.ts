import {
  applySidePanelDataUpdates,
  clearSessionState,
  getSessionKey,
  getSessionState,
  initializeSessionState,
} from '@/entrypoints/background/services/session-storage'
import type { ScrapeConfig, SidePanelConfig } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const read = (tabId: number) =>
  storage.getItem<SidePanelConfig>(`session:${getSessionKey(tabId)}`) as Promise<SidePanelConfig>

describe('getSessionKey', () => {
  it('namespaces the key by tab id', () => {
    expect(getSessionKey(42)).toBe('sidepanel_config_42')
  })
})

describe('applySidePanelDataUpdates', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('writes updates when no state exists yet', async () => {
    await applySidePanelDataUpdates(1, { highlightMatchCount: 7 })

    expect(await read(1)).toEqual({ highlightMatchCount: 7 })
  })

  it('shallow-merges top-level fields with existing state', async () => {
    await applySidePanelDataUpdates(1, { initialSelectionText: 'hello', highlightMatchCount: 1 })
    await applySidePanelDataUpdates(1, { highlightMatchCount: 2 })

    expect(await read(1)).toEqual({ initialSelectionText: 'hello', highlightMatchCount: 2 })
  })

  it('keeps state for different tabs isolated', async () => {
    await applySidePanelDataUpdates(1, { highlightMatchCount: 1 })
    await applySidePanelDataUpdates(2, { highlightMatchCount: 2 })

    expect((await read(1)).highlightMatchCount).toBe(1)
    expect((await read(2)).highlightMatchCount).toBe(2)
  })

  it('keeps existing columns when an update only changes the main selector', async () => {
    const columns = [{ name: 'Title', selector: './/h2' }]
    await applySidePanelDataUpdates(1, { currentScrapeConfig: { mainSelector: '//div', columns } })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//li' } as ScrapeConfig,
    })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//li', columns })
  })

  it('keeps existing columns when the main selector is unchanged', async () => {
    const columns = [{ name: 'Title', selector: './/h2' }]
    await applySidePanelDataUpdates(1, { currentScrapeConfig: { mainSelector: '//div', columns } })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div' } as ScrapeConfig,
    })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//div', columns })
  })

  it('replaces columns when the update provides them explicitly', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [{ name: 'Old', selector: '.' }] },
    })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [{ name: 'New', selector: '@href' }] },
    })

    expect((await read(1)).currentScrapeConfig?.columns).toEqual([
      { name: 'New', selector: '@href' },
    ])
  })

  it('accepts an empty column list as an explicit reset', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [{ name: 'Old', selector: '.' }] },
    })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [] },
    })

    expect((await read(1)).currentScrapeConfig?.columns).toEqual([])
  })

  it('defaults columns to an empty array when neither side has any', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div' } as ScrapeConfig,
    })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//div', columns: [] })
  })

  it('serialises concurrent updates so none are lost', async () => {
    await Promise.all([
      applySidePanelDataUpdates(1, { initialSelectionText: 'a' }),
      applySidePanelDataUpdates(1, { highlightMatchCount: 3 }),
      applySidePanelDataUpdates(1, { pickerModeActive: true }),
    ])

    expect(await read(1)).toEqual({
      initialSelectionText: 'a',
      highlightMatchCount: 3,
      pickerModeActive: true,
    })
  })
})

describe('getSessionState', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('returns null when nothing is stored for the tab', async () => {
    expect(await getSessionState(1)).toBeNull()
  })

  it('returns the stored state', async () => {
    await applySidePanelDataUpdates(1, { initialSelectionText: 'hi' })

    expect(await getSessionState(1)).toEqual({ initialSelectionText: 'hi' })
  })
})

describe('initializeSessionState', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('writes a default blob when no state exists', async () => {
    await initializeSessionState(1)

    expect(await getSessionState(1)).toEqual({})
  })

  it('leaves existing state untouched', async () => {
    await applySidePanelDataUpdates(1, { initialSelectionText: 'keep me' })

    await initializeSessionState(1)

    expect(await getSessionState(1)).toEqual({ initialSelectionText: 'keep me' })
  })
})

describe('clearSessionState', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('removes the tab entry', async () => {
    await applySidePanelDataUpdates(1, { initialSelectionText: 'bye' })

    await clearSessionState(1)

    expect(await getSessionState(1)).toBeNull()
  })

  it('logs and swallows storage failures', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'removeItem').mockRejectedValueOnce(failure)

    await expect(clearSessionState(9)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Error clearing session state for tab 9:', failure)
  })
})
