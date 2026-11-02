// @vitest-environment jsdom
import type { ConfigForm } from '@/components/ConfigForm'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TabPanel } from '@/entrypoints/sidepanel/TabPanel'
import {
  MESSAGE_TYPES,
  type ColumnDefinition,
  type ColumnEdit,
  type ScrapeConfig,
} from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { renderSettled, settleEffects } from '@@/tests/support/settle'
import { act, waitFor } from '@testing-library/react'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

type ConfigFormProps = Parameters<typeof ConfigForm>[0]

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
  const storageKey = `session:sidepanel_config_${TAB_ID}`

  /** Store `columns` as the background would on applying an edit, then reply. */
  const applyAndReply = (columns: ColumnDefinition[]) => async () => {
    await storage.setItem(storageKey, { currentScrapeConfig: { ...config, columns } })
    return { success: true, isColumnEditSuperseded: false }
  }

  beforeEach(async () => {
    fakeBrowser.reset()
    form.props = undefined
    await storage.setItem(storageKey, { currentScrapeConfig: config })
  })

  it('shows the edit and sends it as an operation rather than the column list', async () => {
    await render()
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(
      applyAndReply([rename.column]),
    )

    act(() => {
      form.props!.onColumnEdit(rename)
    })
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

  it('reads back the stored columns once the background reports the edit superseded', async () => {
    await render()
    // Storage is left as it was, so no watcher fires and only the read-back can restore it.
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      success: true,
      isColumnEditSuperseded: true,
    })

    act(() => {
      form.props!.onColumnEdit(rename)
    })
    expect(form.props!.config.columns).toEqual([rename.column])

    await waitFor(() => expect(form.props!.config.columns).toEqual(config.columns))
  })

  it('keeps the columns on screen while an edit is unanswered, then shows the stored ones', async () => {
    await render()
    const reply = Promise.withResolvers<unknown>()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockReturnValue(reply.promise)

    act(() => {
      form.props!.onColumnEdit(rename)
    })
    // A write that predates the edit, as the watcher for an earlier keystroke delivers it.
    await storage.setItem(storageKey, { currentScrapeConfig: { ...config, mainSelector: '//li' } })
    await settleEffects()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: [rename.column] })

    // A Guess reply lands while the edit is still unanswered, which then fails its check.
    const guessedColumns = [{ name: 'Title', selector: './/h2' }]
    await storage.setItem(storageKey, {
      currentScrapeConfig: { mainSelector: '//li', columns: guessedColumns },
    })
    await settleEffects()
    expect(form.props!.config.columns).toEqual([rename.column])

    reply.resolve({ success: true, isColumnEditSuperseded: true })
    await settleEffects()

    expect(form.props!.config).toEqual({ mainSelector: '//li', columns: guessedColumns })
  })

  it('reads storage back only once the last of several edits is answered', async () => {
    await render()
    const replies = [Promise.withResolvers<unknown>(), Promise.withResolvers<unknown>()]
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage')
      .mockReturnValueOnce(replies[0]!.promise)
      .mockReturnValueOnce(replies[1]!.promise)
    const getValue = vi.spyOn(sidePanelConfigItem(TAB_ID), 'getValue')

    act(() => {
      form.props!.onColumnEdit(rename)
    })
    act(() => {
      form.props!.onColumnEdit({ type: 'add' })
    })
    getValue.mockClear()
    replies[0]!.resolve({ success: true, isColumnEditSuperseded: false })
    await settleEffects()

    expect(getValue).not.toHaveBeenCalled()

    replies[1]!.resolve({ success: true, isColumnEditSuperseded: false })
    await settleEffects()

    expect(getValue).toHaveBeenCalledTimes(1)
  })

  it('leaves the panel as it is when the tab closed before the read-back', async () => {
    await render()
    spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockImplementation(async () => {
      await storage.removeItem(storageKey)
      return { success: true, isColumnEditSuperseded: true }
    })
    const logError = vi.spyOn(log, 'error')

    act(() => {
      form.props!.onColumnEdit(rename)
    })
    await settleEffects()

    expect(form.props!.config.columns).toEqual([rename.column])
    expect(logError).not.toHaveBeenCalled()
  })

  it('sends nothing without a tab', async () => {
    await render(null)
    const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(
      undefined,
    )

    act(() => {
      form.props!.onColumnEdit({ type: 'add' })
    })
    await settleEffects()

    expect(form.props!.config.columns).toHaveLength(2)
    expect(sidePanelWrites(sendMessage)).toEqual([])
  })
})
