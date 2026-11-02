// @vitest-environment jsdom
import type { ConfigForm } from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { COLUMN_EDIT_NOT_SAVED, TabPanel } from '@/entrypoints/sidepanel/TabPanel'
import {
  MESSAGE_TYPES,
  type ColumnDefinition,
  type ColumnEdit,
  type ScrapeConfig,
  type SidePanelConfig,
} from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
import { act, waitFor } from '@testing-library/react'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

type ConfigFormProps = Parameters<typeof ConfigForm>[0]

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
            },
          },
        },
      ],
    ])
  })

  it('trims the selector of a loaded preset before showing, writing and highlighting it', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )
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
            },
          },
        },
      ],
    ])
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

describe('TabPanel column edits', () => {
  const [rank] = config.columns as [ColumnDefinition]
  const rename: ColumnEdit = {
    type: 'update',
    index: 0,
    expected: rank,
    column: { name: 'Position', selector: './td[1]' },
  }
  const guessedColumns = [{ name: 'Title', selector: './/h2' }]
  const storageKey = `session:sidepanel_config_${TAB_ID}`
  const applied = { success: true, isColumnEditSuperseded: false }
  const superseded = { success: true, isColumnEditSuperseded: true }

  /** Store `columns` as the background would on applying an edit, then reply. */
  const applyAndReply = (columns: ColumnDefinition[]) => async () => {
    await storage.setItem(storageKey, { currentScrapeConfig: { ...config, columns } })
    return applied
  }

  const edit = (columnEdit: ColumnEdit) => {
    act(() => {
      form.props!.onColumnEdit(columnEdit)
    })
  }

  const spyOnReadBack = () => vi.spyOn(sidePanelConfigItem(TAB_ID), 'getValue')

  beforeEach(async () => {
    fakeBrowser.reset()
    form.props = undefined
    toastMocks.toast.error.mockClear()
    await storage.setItem(storageKey, { currentScrapeConfig: config })
  })

  it('shows the edit and sends it as an operation rather than the column list', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      applyAndReply([rename.column]),
    )

    edit(rename)
    await settleEffects()

    expect(form.props!.config.columns).toEqual([rename.column])
    expect(sidePanelWrites(sendMessage)).toEqual([
      [
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: { tabId: TAB_ID, updates: { columnEdit: rename } },
        },
      ],
    ])
  })

  it('reads nothing back when the stored columns match the panel', async () => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      applyAndReply([rename.column]),
    )
    const readBack = spyOnReadBack()

    edit(rename)
    await settleEffects()

    expect(readBack).not.toHaveBeenCalled()
  })

  it('reads back the stored columns once the background reports the edit superseded', async () => {
    await render()
    // Storage is left as it was, so no watcher fires and only the read-back can restore it.
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(superseded)

    edit(rename)
    expect(form.props!.config.columns).toEqual([rename.column])

    await waitFor(() => expect(form.props!.config.columns).toEqual(config.columns))
  })

  it('holds the stored columns while an edit is unanswered and shows them once it is', async () => {
    await render()
    const reply = Promise.withResolvers<unknown>()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockReturnValue(reply.promise)

    edit(rename)
    // A Guess reply stored after the edit, with a selector of its own.
    await storage.setItem(storageKey, {
      currentScrapeConfig: { mainSelector: '//li', columns: guessedColumns },
    })
    await settleEffects()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: [rename.column] })

    reply.resolve(applied)
    await settleEffects()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: guessedColumns })
  })

  it('takes only the columns from a read-back', async () => {
    await render()
    const reply = Promise.withResolvers<unknown>()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage')
      .mockReturnValueOnce(reply.promise)
      // The selector write has not landed when the read-back runs.
      .mockResolvedValue(undefined)

    edit(rename)
    act(() => {
      form.props!.onMainSelectorChange('//li')
    })
    reply.resolve(superseded)
    await settleEffects()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: config.columns })
  })

  it('reads storage back once, after the last of several edits is answered', async () => {
    await render()
    const replies = [Promise.withResolvers<unknown>(), Promise.withResolvers<unknown>()]
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage')
      .mockReturnValueOnce(replies[0]!.promise)
      .mockReturnValueOnce(replies[1]!.promise)
    const readBack = spyOnReadBack()

    edit(rename)
    edit({ type: 'add' })
    readBack.mockClear()
    replies[0]!.resolve(superseded)
    await settleEffects()

    expect(readBack).not.toHaveBeenCalled()

    replies[1]!.resolve(applied)
    await settleEffects()

    expect(readBack).toHaveBeenCalledTimes(1)
    expect(form.props!.config.columns).toEqual(config.columns)
  })

  it('discards a read-back that an edit made during the read has overtaken', async () => {
    await render()
    const laterReply = Promise.withResolvers<unknown>()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValueOnce(superseded)
      .mockReturnValueOnce(laterReply.promise)
    const read = Promise.withResolvers<SidePanelConfig | null>()
    spyOnReadBack().mockReturnValueOnce(read.promise)

    edit(rename)
    await settleEffects()
    edit({ type: 'add' })
    read.resolve({ currentScrapeConfig: { ...config, columns: guessedColumns } })
    await settleEffects()

    expect(form.props!.config.columns).toEqual([rename.column, { name: 'Column 2', selector: '.' }])
  })

  it.each([
    ['refuses the edit', () => Promise.resolve({ success: false, error: 'Lock timed out' })],
    ['cannot be reached', () => Promise.reject(new Error('Receiving end does not exist'))],
  ])(
    'reports a lost edit and shows the stored columns when the background %s',
    async (_, reply) => {
      await render()
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(reply)
      vi.spyOn(log, 'error').mockImplementation(() => {})

      edit(rename)

      await waitFor(() => expect(form.props!.config.columns).toEqual(config.columns))
      expect(toastMocks.toast.error).toHaveBeenCalledWith(COLUMN_EDIT_NOT_SAVED, {
        id: COLUMN_EDIT_NOT_SAVED,
      })
    },
  )

  it('leaves the panel as it is when the tab closed before the read-back', async () => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(async () => {
      await storage.removeItem(storageKey)
      return superseded
    })
    const logError = vi.spyOn(log, 'error')

    edit(rename)
    await settleEffects()

    expect(form.props!.config.columns).toEqual([rename.column])
    expect(logError).not.toHaveBeenCalled()
  })

  it('sends nothing without a tab', async () => {
    await render(null)
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    edit({ type: 'add' })
    await settleEffects()

    expect(form.props!.config.columns).toHaveLength(2)
    expect(sidePanelWrites(sendMessage)).toEqual([])
  })
})
