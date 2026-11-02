// @vitest-environment jsdom
import type { ConfigForm } from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applySidePanelDataUpdates } from '@/entrypoints/background/services/session-storage'
import {
  COLUMN_EDIT_NOT_SAVED,
  MAIN_SELECTOR_NOT_SAVED,
  PRESET_NOT_SAVED,
  TabPanel,
} from '@/entrypoints/sidepanel/TabPanel'
import { DEFAULT_SCRAPE_CONFIG } from '@/utils/scrape-config'
import {
  MESSAGE_TYPES,
  type ColumnDefinition,
  type ColumnEdit,
  type Message,
  type Preset,
  type ScrapeConfig,
  type SidePanelConfigUpdate,
} from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
import { act, waitFor } from '@testing-library/react'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

type ConfigFormProps = Parameters<typeof ConfigForm>[0]

interface UpdatePayload {
  tabId: number
  updates: SidePanelConfigUpdate
}

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => toastMocks)

// The form cannot raise an edit that leaves the config as it was (a controlled
// input fires no change for its current value), so the stub hands its props out.
const form = vi.hoisted(() => ({ props: undefined as ConfigFormProps | undefined }))
vi.mock('@/components/ConfigForm', () => ({
  ConfigForm: (props: ConfigFormProps) => {
    form.props = props
    return null
  },
}))

const TAB_ID = 4
const config: ScrapeConfig = {
  mainSelector: '//tr',
  columns: [{ name: 'Rank', selector: './td[1]' }],
}

const sidePanelWrites = (sendMessage: ReturnType<typeof spyOnBrowser>) =>
  sendMessage.mock.calls.filter(
    ([message]) => (message as { type: string }).type === MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
  )

const render = (tabId: number | null = TAB_ID) =>
  renderSettled(
    <TooltipProvider>
      <TabPanel
        tabId={tabId}
        tabUrl="https://example.com/table"
        presets={[]}
        onSavePreset={() => Promise.resolve()}
        onDeletePreset={() => {}}
      />
    </TooltipProvider>,
  )

describe('TabPanel config edits', () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    form.props = undefined
    await storage.setItem(`session:sidepanel_config_${TAB_ID}`, { currentScrapeConfig: config })
  })

  it('writes nothing for an edit that leaves the config as it was', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )
    act(() => {
      form.props!.onMainSelectorChange(form.props!.config.mainSelector)
    })

    expect(sidePanelWrites(sendMessage)).toEqual([])
  })

  it('writes only the field an edit changed', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    act(() => {
      form.props!.onMainSelectorChange('//li')
    })

    expect(sidePanelWrites(sendMessage)).toEqual([
      [
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: TAB_ID,
            updates: {
              currentScrapeConfig: { mainSelector: '//li' },
              highlightMatchCount: null,
              highlightError: null,
              panelConfigSeq: 1,
            },
          },
        },
      ],
    ])
  })

  it('trims the selector of an edit before writing it', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    act(() => {
      form.props!.onMainSelectorChange('  //li ')
    })

    expect(form.props!.config.mainSelector).toBe('//li')
    expect(sidePanelWrites(sendMessage)).toEqual([
      [
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: TAB_ID,
            updates: {
              currentScrapeConfig: { mainSelector: '//li' },
              highlightMatchCount: null,
              highlightError: null,
              panelConfigSeq: 1,
            },
          },
        },
      ],
    ])
  })

  it('trims the selector of a loaded preset before showing, writing and highlighting it', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      success: true,
    })
    const tabsSendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined,
    )

    act(() => {
      form.props!.onLoadPreset({
        id: 'padded',
        name: 'Padded',
        config: { ...config, mainSelector: ' //li\t' },
        createdAt: 0,
      })
    })

    expect(form.props!.config.mainSelector).toBe('//li')
    expect(sidePanelWrites(sendMessage)).toEqual([
      [
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: TAB_ID,
            updates: {
              currentScrapeConfig: { mainSelector: '//li', columns: config.columns },
              highlightMatchCount: null,
              highlightError: null,
              panelConfigSeq: 1,
            },
          },
        },
      ],
    ])
    await settleEffects()
    expect(tabsSendMessage).toHaveBeenCalledWith(
      TAB_ID,
      { type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//li' } },
      expect.any(Function),
    )
  })

  it('does not advise a re-scrape for a stored result whose selector differs only by padding', async () => {
    await storage.setItem(`session:sidepanel_config_${TAB_ID}`, {
      currentScrapeConfig: config,
      resultProducingConfig: { ...config, mainSelector: ' //tr ' },
      scrapeResult: {
        data: [{ data: { Rank: '1' }, metadata: { originalIndex: 0, isEmpty: false } }],
        columnOrder: ['Rank'],
      },
    })

    await render()

    expect(form.props!.rescrapeAdvised).toBe(false)
  })
})

describe('TabPanel numbered config writes', () => {
  const [rank] = config.columns as [ColumnDefinition]
  const rename: ColumnEdit = {
    type: 'update',
    index: 0,
    expected: rank,
    column: { name: 'Position', selector: './td[1]' },
  }
  const added = { name: 'Column 2', selector: '.' }
  const guessedColumns = [{ name: 'Title', selector: './/h2' }]
  const storageKey = `session:sidepanel_config_${TAB_ID}`
  const preset = (mainSelector: string, columns: ColumnDefinition[]): Preset => ({
    id: 'p',
    name: 'Preset',
    config: { mainSelector, columns },
    createdAt: 0,
  })

  /**
   * A background that applies each write with the real merge, once released,
   * in the order the writes were sent.
   */
  const heldBackground = () => {
    const gates: PromiseWithResolvers<undefined>[] = []
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      async (message: unknown) => {
        const gate = Promise.withResolvers<undefined>()
        gates.push(gate)
        await gate.promise
        const { tabId, updates } = (message as Message<UpdatePayload>).payload!
        await applySidePanelDataUpdates(tabId, updates)
        return { success: true }
      },
    )
    const release = async () => {
      gates.shift()!.resolve(undefined)
      await settleEffects()
    }
    return { sendMessage, release }
  }

  /** A background whose writes the test answers one by one, in any order. */
  const scriptedBackground = () => {
    const calls: { message: unknown; outcome: PromiseWithResolvers<'store' | 'fail'> }[] = []
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      async (message: unknown) => {
        const outcome = Promise.withResolvers<'store' | 'fail'>()
        calls.push({ message, outcome })
        if ((await outcome.promise) === 'fail') return { success: false, error: 'Lock timed out' }
        const { tabId, updates } = (message as Message<UpdatePayload>).payload!
        await applySidePanelDataUpdates(tabId, updates)
        return { success: true }
      },
    )
    const answer = async (index: number, outcome: 'store' | 'fail') => {
      calls[index]!.outcome.resolve(outcome)
      await settleEffects()
    }
    return { answer }
  }

  const edit = (columnEdit: ColumnEdit) => {
    act(() => {
      form.props!.onColumnEdit(columnEdit)
    })
  }

  const loadPreset = (loaded: Preset) => {
    act(() => {
      form.props!.onLoadPreset(loaded)
    })
  }

  /** A write another context (Guess, the picker) stores while the panel waits. */
  const storeGuess = async (mainSelector = '//tr') => {
    await applySidePanelDataUpdates(TAB_ID, {
      currentScrapeConfig: { mainSelector, columns: guessedColumns },
    })
    await settleEffects()
  }

  const highlightRequests = (tabsSendMessage: ReturnType<typeof spyOnBrowser>) =>
    tabsSendMessage.mock.calls.filter(
      ([, message]) => (message as { type: string }).type === MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
    )

  beforeEach(async () => {
    fakeBrowser.reset()
    form.props = undefined
    toastMocks.toast.error.mockClear()
    await storage.setItem(storageKey, { currentScrapeConfig: config })
  })

  it('shows a column edit and sends it as a numbered operation', async () => {
    await render()
    const { sendMessage, release } = heldBackground()

    edit(rename)
    await release()

    expect(form.props!.config.columns).toEqual([rename.column])
    expect(sidePanelWrites(sendMessage)).toEqual([
      [
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: { tabId: TAB_ID, updates: { columnEdit: rename, panelConfigSeq: 1 } },
        },
      ],
    ])
  })

  it('numbers its writes after the last one storage recorded', async () => {
    await storage.setItem(storageKey, { currentScrapeConfig: config, panelConfigSeq: 7 })
    await render()
    const { sendMessage, release } = heldBackground()

    edit(rename)
    await release()

    expect(sidePanelWrites(sendMessage)[0]![0]).toMatchObject({
      payload: { updates: { panelConfigSeq: 8 } },
    })
  })

  it('keeps guessed columns stored before a column edit lands, once the edit is answered', async () => {
    await render()
    const { release } = heldBackground()

    edit(rename)
    await storeGuess()

    // The Guess predates the edit still on its way, so the edit stays on screen.
    expect(form.props!.config.columns).toEqual([rename.column])

    await release()

    expect(form.props!.config.columns).toEqual(guessedColumns)
  })

  it('lets a Guess stored after a column edit replace the edited columns', async () => {
    await render()
    const { release } = heldBackground()

    edit(rename)
    await release()
    await storeGuess()

    expect(form.props!.config.columns).toEqual(guessedColumns)
  })

  it('does not roll a column back to an earlier keystroke while a later one is unanswered', async () => {
    await render()
    const { release } = heldBackground()

    edit(rename)
    edit({ type: 'add' })
    await release()

    expect(form.props!.config.columns).toEqual([rename.column, added])

    await release()

    expect(form.props!.config.columns).toEqual([rename.column, added])
  })

  it('shows a preset whole while it is unanswered and highlights it once stored', async () => {
    await render()
    const { release } = heldBackground()
    const tabsSendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined,
    )
    const loaded = preset('//li', guessedColumns)

    edit(rename)
    loadPreset(loaded)
    // The edit lands first; its state predates the preset.
    await release()

    expect(form.props!.config).toEqual(loaded.config)
    expect(highlightRequests(tabsSendMessage)).toEqual([])

    await release()

    expect(form.props!.config).toEqual(loaded.config)
    expect(highlightRequests(tabsSendMessage)).toHaveLength(1)
  })

  it.each([
    [
      'a column edit',
      COLUMN_EDIT_NOT_SAVED,
      () => {
        edit(rename)
      },
    ],
    [
      'a preset load',
      PRESET_NOT_SAVED,
      () => {
        loadPreset(preset('//li', guessedColumns))
      },
    ],
    [
      'a main selector',
      MAIN_SELECTOR_NOT_SAVED,
      () => {
        act(() => {
          form.props!.onMainSelectorChange('//li')
        })
      },
    ],
  ])('restores the stored config when %s is not stored', async (_, failure, write) => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      success: false,
      error: 'Lock timed out',
    })
    const tabsSendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined,
    )
    vi.spyOn(log, 'error').mockImplementation(() => {})

    write()

    await waitFor(() => expect(form.props!.config).toEqual(config))
    expect(toastMocks.toast.error).toHaveBeenCalledWith(failure, { id: failure })
    expect(highlightRequests(tabsSendMessage)).toEqual([])
  })

  it('restores the stored config when the background cannot be reached', async () => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(
      new Error('Receiving end does not exist'),
    )
    vi.spyOn(log, 'error').mockImplementation(() => {})

    edit(rename)

    await waitFor(() => expect(form.props!.config).toEqual(config))
    expect(toastMocks.toast.error).toHaveBeenCalledWith(COLUMN_EDIT_NOT_SAVED, {
      id: COLUMN_EDIT_NOT_SAVED,
    })
  })

  it('shows the state of a later write when an earlier one fails', async () => {
    await render()
    const later = Promise.withResolvers<undefined>()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValueOnce({ success: false, error: 'Lock timed out' })
      .mockImplementationOnce(async (message: unknown) => {
        await later.promise
        const { tabId, updates } = (message as Message<UpdatePayload>).payload!
        await applySidePanelDataUpdates(tabId, updates)
        return { success: true }
      })
    const readBack = vi.spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
    vi.spyOn(log, 'error').mockImplementation(() => {})

    edit(rename)
    edit({ type: 'update', index: 0, expected: rename.column, column: rank })
    readBack.mockClear()
    await settleEffects()

    expect(readBack).not.toHaveBeenCalled()

    later.resolve(undefined)
    await settleEffects()

    // The first edit never reached storage, so the second one no longer matches it.
    expect(form.props!.config.columns).toEqual(config.columns)
  })

  it('waits for an earlier write still on its way when the latest one fails', async () => {
    await render()
    const { answer } = scriptedBackground()
    const readBack = vi.spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
    vi.spyOn(log, 'error').mockImplementation(() => {})

    act(() => {
      form.props!.onMainSelectorChange('//li')
    })
    edit(rename)
    readBack.mockClear()
    await answer(1, 'fail')

    expect(readBack).not.toHaveBeenCalled()
    expect(form.props!.config.mainSelector).toBe('//li')

    await answer(0, 'store')

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: config.columns })
  })

  it('restores the stored config once the earlier write it waited for fails too', async () => {
    await render()
    const { answer } = scriptedBackground()
    vi.spyOn(log, 'error').mockImplementation(() => {})

    act(() => {
      form.props!.onMainSelectorChange('//li')
    })
    edit(rename)
    await answer(1, 'fail')
    await answer(0, 'fail')

    expect(form.props!.config).toEqual(config)
  })

  it('keeps the state of a later write that was stored when an earlier one fails', async () => {
    await render()
    const { answer } = scriptedBackground()
    const readBack = vi.spyOn(sidePanelConfigItem(TAB_ID), 'getValue')
    vi.spyOn(log, 'error').mockImplementation(() => {})

    edit(rename)
    edit({ type: 'add' })
    await answer(1, 'store')
    readBack.mockClear()
    await answer(0, 'fail')

    expect(readBack).not.toHaveBeenCalled()
    expect(form.props!.config.columns).toEqual([rank, added])
  })

  it('does not highlight a preset the user moved on from before it was stored', async () => {
    await render()
    const { release } = heldBackground()
    const tabsSendMessage = spyOnBrowser(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(
      undefined,
    )

    loadPreset(preset('//li', guessedColumns))
    act(() => {
      form.props!.onMainSelectorChange('//ul')
    })
    await release()

    expect(highlightRequests(tabsSendMessage)).toEqual([])
  })

  it('shows the default config when a write fails and nothing is stored', async () => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(async () => {
      await storage.removeItem(storageKey)
      return { success: false, error: 'Tab closed' }
    })
    vi.spyOn(log, 'error').mockImplementation(() => {})

    edit(rename)

    await waitFor(() => expect(form.props!.config).toEqual(DEFAULT_SCRAPE_CONFIG))
  })

  it('keeps a column edit when a selector commit from an earlier render lands after it', async () => {
    await render()
    const { release } = heldBackground()
    // The handler a deferred blur commit holds on to.
    const commitFromBlurRender = form.props!.onMainSelectorChange

    edit(rename)
    await release()
    act(() => {
      commitFromBlurRender('//li')
    })
    await release()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: [rename.column] })
  })

  it('sends nothing without a tab', async () => {
    await render(null)
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )
    const loaded = preset('', guessedColumns)

    edit({ type: 'add' })
    await settleEffects()

    expect(form.props!.config.columns).toHaveLength(2)

    loadPreset(loaded)
    await settleEffects()

    expect(form.props!.config).toEqual(loaded.config)
    expect(sidePanelWrites(sendMessage)).toEqual([])
  })
})
