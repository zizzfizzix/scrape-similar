import {
  applySidePanelDataUpdates,
  clearSessionState,
  getSessionState,
  initializeSessionState,
} from '@/entrypoints/background/services/session-storage'
import { DEFAULT_SCRAPE_CONFIG } from '@/utils/scrape-config'
import { buildMainSelectorUpdates } from '@/utils/sidepanel-state'
import type { ColumnDefinition, ColumnEdit, ScrapeConfig, SidePanelConfig } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const read = (tabId: number) =>
  storage.getItem<SidePanelConfig>(sidePanelConfigItem(tabId).key) as Promise<SidePanelConfig>

describe('applySidePanelDataUpdates', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('writes updates when no state exists yet', async () => {
    await applySidePanelDataUpdates(1, { highlightMatchCount: 7 })

    expect(await read(1)).toEqual({ highlightMatchCount: 7 })
  })

  it('shallow-merges top-level fields with existing state', async () => {
    await applySidePanelDataUpdates(1, { highlightError: 'hello', highlightMatchCount: 1 })
    await applySidePanelDataUpdates(1, { highlightMatchCount: 2 })

    expect(await read(1)).toEqual({ highlightError: 'hello', highlightMatchCount: 2 })
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
      currentScrapeConfig: { mainSelector: '//li' },
    })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//li', columns })
  })

  it('keeps existing columns when the main selector is unchanged', async () => {
    const columns = [{ name: 'Title', selector: './/h2' }]
    await applySidePanelDataUpdates(1, { currentScrapeConfig: { mainSelector: '//div', columns } })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div' },
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

  it('defaults columns to the ones the panel shows when neither side has any', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div' },
    })

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//div',
      columns: DEFAULT_SCRAPE_CONFIG.columns,
    })
  })

  it('keeps the stored main selector when an update only changes the columns', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [] },
    })
    const columns = [{ name: 'Href', selector: '@href' }]

    await applySidePanelDataUpdates(1, { currentScrapeConfig: { columns } })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//div', columns })
  })

  it('trims a padded stored main selector when an update only changes the columns', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: ' //div ', columns: [] },
    })
    const columns = [{ name: 'Href', selector: '@href' }]

    await applySidePanelDataUpdates(1, { currentScrapeConfig: { columns } })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//div', columns })
  })

  it('defaults the main selector to blank when neither side has one', async () => {
    const columns = [{ name: 'Href', selector: '@href' }]

    await applySidePanelDataUpdates(1, { currentScrapeConfig: { columns } })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '', columns })
  })

  it('keeps the selector the panel seeded from a right-clicked element when an update only changes the columns', async () => {
    await applySidePanelDataUpdates(1, { elementDetails: { xpath: '//a' } })
    const columns = [{ name: 'Href', selector: '@href' }]

    await applySidePanelDataUpdates(1, { currentScrapeConfig: { columns } })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//a', columns })
  })

  it('keeps the stored fields when an update carries malformed ones', async () => {
    const stored: ScrapeConfig = {
      mainSelector: '//div',
      columns: [{ name: 'Title', selector: './/h2' }],
    }
    await applySidePanelDataUpdates(1, { currentScrapeConfig: stored })

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: 7, columns: { name: 'x' } } as unknown as ScrapeConfig,
    })

    expect((await read(1)).currentScrapeConfig).toEqual(stored)
  })

  it('fills a stored empty column list with the default the panel shows on a selector-only update', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [] },
    })

    await applySidePanelDataUpdates(1, { currentScrapeConfig: { mainSelector: '//li' } })

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//li',
      columns: DEFAULT_SCRAPE_CONFIG.columns,
    })
  })

  it('leaves the config unstored when an update carries no config fields', async () => {
    await applySidePanelDataUpdates(1, { elementDetails: { xpath: '//a' } })

    await applySidePanelDataUpdates(1, { currentScrapeConfig: {} })

    expect(await read(1)).toEqual({ elementDetails: { xpath: '//a' } })
  })

  it('keeps the stored config when an update sets it to undefined', async () => {
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: [] },
    })

    await applySidePanelDataUpdates(1, { currentScrapeConfig: undefined })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//div', columns: [] })
  })

  it('keeps guessed columns stored after the panel read its config when the panel edits the selector', async () => {
    const shownInPanel: ScrapeConfig = {
      mainSelector: '//div',
      columns: [{ name: 'Text', selector: '.' }],
    }
    await applySidePanelDataUpdates(1, { currentScrapeConfig: shownInPanel })
    const guessedColumns = [{ name: 'Title', selector: './/h2' }]
    // The content script stores a Guess reply the panel has not applied yet.
    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: guessedColumns },
    })

    await applySidePanelDataUpdates(1, buildMainSelectorUpdates(shownInPanel.mainSelector, '//li')!)

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//li',
      columns: guessedColumns,
    })
  })

  it('serialises concurrent updates so none are lost', async () => {
    await Promise.all([
      applySidePanelDataUpdates(1, { highlightError: 'a' }),
      applySidePanelDataUpdates(1, { highlightMatchCount: 3 }),
      applySidePanelDataUpdates(1, { pickerModeActive: true }),
    ])

    expect(await read(1)).toEqual({
      highlightError: 'a',
      highlightMatchCount: 3,
      pickerModeActive: true,
    })
  })
})

describe('applySidePanelDataUpdates with a column edit', () => {
  const shownInPanel: ScrapeConfig = {
    mainSelector: '//div',
    columns: [
      { name: 'Text', selector: '.' },
      { name: 'Link', selector: '@href' },
    ],
  }
  const guessedColumns = [{ name: 'Title', selector: './/h2' }]
  const [text, link] = shownInPanel.columns as [ColumnDefinition, ColumnDefinition]
  const renameText: ColumnEdit = {
    type: 'update',
    index: 0,
    expected: text,
    column: { name: 'Label', selector: '.' },
  }

  /** The content script stores a Guess reply the panel has not applied yet. */
  const storeGuess = () =>
    applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//div', columns: guessedColumns },
    })

  beforeEach(async () => {
    fakeBrowser.reset()
    await applySidePanelDataUpdates(1, { currentScrapeConfig: shownInPanel })
  })

  it('applies an edit to the column it was made against', async () => {
    await applySidePanelDataUpdates(1, { columnEdit: renameText })

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//div',
      columns: [renameText.column, link],
    })
  })

  it('keeps guessed columns stored after the panel read its config when the panel renames a column', async () => {
    await storeGuess()

    await applySidePanelDataUpdates(1, { columnEdit: renameText })

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//div',
      columns: guessedColumns,
    })
  })

  it('lets a Guess stored after a column edit replace the edited columns', async () => {
    await applySidePanelDataUpdates(1, { columnEdit: renameText })

    await storeGuess()

    expect((await read(1)).currentScrapeConfig?.columns).toEqual(guessedColumns)
  })

  it('keeps guessed columns when the panel removes a column it no longer shows', async () => {
    await storeGuess()

    await applySidePanelDataUpdates(1, {
      columnEdit: { type: 'remove', index: 1, expected: link },
    })

    expect((await read(1)).currentScrapeConfig?.columns).toEqual(guessedColumns)
  })

  it('numbers an added column after the columns stored since the panel read them', async () => {
    await storeGuess()
    await applySidePanelDataUpdates(1, { columnEdit: { type: 'add' } })

    expect((await read(1)).currentScrapeConfig?.columns).toEqual([
      ...guessedColumns,
      { name: 'Column 2', selector: '.' },
    ])
  })

  it('applies an edit to the default columns the panel shows before any are stored', async () => {
    fakeBrowser.reset()
    await applySidePanelDataUpdates(1, { elementDetails: { xpath: '//a' } })
    const [shownColumn] = DEFAULT_SCRAPE_CONFIG.columns as [ColumnDefinition]
    const column = { ...shownColumn, name: 'Label' }

    await applySidePanelDataUpdates(1, {
      columnEdit: { type: 'update', index: 0, expected: shownColumn, column },
    })

    expect((await read(1)).currentScrapeConfig).toEqual({ mainSelector: '//a', columns: [column] })
  })

  it('still writes the other fields of an update whose column edit is superseded', async () => {
    await storeGuess()

    await applySidePanelDataUpdates(1, { columnEdit: renameText, highlightMatchCount: 4 })

    expect(await read(1)).toMatchObject({
      currentScrapeConfig: { columns: guessedColumns },
      highlightMatchCount: 4,
    })
  })

  it('drops a malformed column edit and reports it', async () => {
    await applySidePanelDataUpdates(1, {
      columnEdit: { type: 'rename', index: 0, expected: text } as unknown as ColumnEdit,
    })

    expect((await read(1)).currentScrapeConfig).toEqual(shownInPanel)
  })

  it('still writes the config of an update whose column edit is superseded', async () => {
    await storeGuess()

    await applySidePanelDataUpdates(1, {
      currentScrapeConfig: { mainSelector: '//li' },
      columnEdit: renameText,
    })

    expect((await read(1)).currentScrapeConfig).toEqual({
      mainSelector: '//li',
      columns: guessedColumns,
    })
  })

  it('records the panel write number whether the edit is applied or dropped', async () => {
    await applySidePanelDataUpdates(1, { columnEdit: renameText, panelConfigSeq: 4 })

    expect((await read(1)).panelConfigSeq).toBe(4)

    await applySidePanelDataUpdates(1, { columnEdit: renameText, panelConfigSeq: 5 })

    expect(await read(1)).toMatchObject({
      panelConfigSeq: 5,
      currentScrapeConfig: { columns: [renameText.column, link] },
    })
  })

  it('keeps the recorded write number through a write that carries none', async () => {
    await applySidePanelDataUpdates(1, { columnEdit: renameText, panelConfigSeq: 4 })

    await storeGuess()

    expect((await read(1)).panelConfigSeq).toBe(4)
  })

  it('ignores a write number that is not an integer', async () => {
    await applySidePanelDataUpdates(1, { panelConfigSeq: 4 })

    await applySidePanelDataUpdates(1, { panelConfigSeq: '5' as unknown as number })

    expect((await read(1)).panelConfigSeq).toBe(4)
  })

  it('never stores the edit itself', async () => {
    await applySidePanelDataUpdates(1, { columnEdit: renameText })

    expect(await read(1)).not.toHaveProperty('columnEdit')
  })
})

describe('getSessionState', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('returns null when nothing is stored for the tab', async () => {
    expect(await getSessionState(1)).toBeNull()
  })

  it('sees an update already in flight', async () => {
    const update = applySidePanelDataUpdates(1, { highlightError: 'pending' })

    const [state] = await Promise.all([getSessionState(1), update])

    expect(state).toEqual({ highlightError: 'pending' })
  })

  it('returns the stored state', async () => {
    await applySidePanelDataUpdates(1, { highlightError: 'hi' })

    expect(await getSessionState(1)).toEqual({ highlightError: 'hi' })
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
    await applySidePanelDataUpdates(1, { highlightError: 'keep me' })

    await initializeSessionState(1)

    expect(await getSessionState(1)).toEqual({ highlightError: 'keep me' })
  })

  it('keeps an update queued while it reads the existing state', async () => {
    await Promise.all([
      initializeSessionState(1),
      applySidePanelDataUpdates(1, { highlightError: 'queued' }),
    ])

    expect(await getSessionState(1)).toEqual({ highlightError: 'queued' })
  })
})

describe('clearSessionState', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  // A closed tab id stays closed for the life of the module, so each test
  // closes a tab of its own.

  it('removes the tab entry', async () => {
    await applySidePanelDataUpdates(11, { highlightError: 'bye' })

    await clearSessionState(11)

    expect(await getSessionState(11)).toBeNull()
  })

  it('removes the entry after an update already in flight', async () => {
    const update = applySidePanelDataUpdates(12, { highlightError: 'late' })

    await Promise.all([update, clearSessionState(12)])

    expect(await getSessionState(12)).toBeNull()
  })

  it('refuses an update that requests the lock after the clear', async () => {
    await applySidePanelDataUpdates(13, { highlightError: 'open' })

    const clear = clearSessionState(13)
    const update = applySidePanelDataUpdates(13, { highlightError: 'after close' })
    await Promise.all([clear, update])

    expect(await read(13)).toBeNull()
  })

  it('refuses an update that arrives after the clear has finished', async () => {
    await clearSessionState(14)

    await applySidePanelDataUpdates(14, { highlightMatchCount: 1 })

    expect(await read(14)).toBeNull()
  })

  it('refuses to initialize state for a closed tab', async () => {
    await clearSessionState(15)

    await initializeSessionState(15)

    expect(await read(15)).toBeNull()
  })

  it('leaves other tabs writable', async () => {
    await clearSessionState(16)

    await applySidePanelDataUpdates(17, { highlightMatchCount: 2 })

    expect(await read(17)).toEqual({ highlightMatchCount: 2 })
  })

  it('drops the cached item for the tab', async () => {
    const item = sidePanelConfigItem(18)

    await clearSessionState(18)

    expect(sidePanelConfigItem(18)).not.toBe(item)
  })

  it('logs and swallows storage failures', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(fakeBrowser.storage.session, 'remove').mockRejectedValueOnce(failure)

    const item = sidePanelConfigItem(9)

    await expect(clearSessionState(9)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Error clearing session state for tab 9:', failure)
    expect(sidePanelConfigItem(9)).not.toBe(item)
  })
})
