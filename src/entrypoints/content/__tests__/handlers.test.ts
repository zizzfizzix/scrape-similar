// @vitest-environment jsdom
import {
  createMessageHandler,
  describeXPathError,
  interpretStoreReply,
} from '@/entrypoints/content/handlers'
import { createState, type ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { MESSAGE_TYPES, type Message } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const highlightMocks = vi.hoisted(() => ({
  highlightMatchingElements: vi.fn(),
}))
vi.mock('@/entrypoints/content/highlight', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entrypoints/content/highlight')>()),
  highlightMatchingElements: highlightMocks.highlightMatchingElements,
}))

describe('describeXPathError', () => {
  it('reports a malformed expression as invalid XPath', () => {
    const error = new DOMException(
      "Failed to execute 'evaluate' on 'Document': The string '//[' is not a valid XPath expression.",
      'SyntaxError',
    )

    expect(describeXPathError(error)).toBe('Invalid XPath')
  })

  it('passes through a DOMException from somewhere else', () => {
    expect(describeXPathError(new DOMException('Node was not found', 'NotFoundError'))).toBe(
      'Node was not found',
    )
  })

  it('passes through a SyntaxError with an unrelated message', () => {
    expect(describeXPathError(new DOMException('something else', 'SyntaxError'))).toBe(
      'something else',
    )
  })

  it('uses a plain error’s message', () => {
    expect(describeXPathError(new Error('boom'))).toBe('boom')
  })

  it('uses a thrown string as-is', () => {
    expect(describeXPathError('just a string')).toBe('just a string')
  })

  it('falls back to a generic message for anything else', () => {
    expect(describeXPathError({ code: 12 })).toBe('Evaluation failed')
    expect(describeXPathError(undefined)).toBe('Evaluation failed')
  })
})

describe('interpretStoreReply', () => {
  const options = { fallbackError: 'Failed to save config' }

  it('accepts a successful reply', () => {
    expect(interpretStoreReply(undefined, { success: true }, options)).toEqual({ success: true })
  })

  it('reports the background’s own error', () => {
    expect(interpretStoreReply(undefined, { success: false, error: 'no tab' }, options)).toEqual({
      success: false,
      error: 'no tab',
    })
  })

  it('falls back when the background declines without a reason', () => {
    expect(interpretStoreReply(undefined, { success: false }, options)).toEqual({
      success: false,
      error: 'Failed to save config',
    })
  })

  it('falls back when there is no reply at all', () => {
    expect(interpretStoreReply(undefined, undefined, options)).toEqual({
      success: false,
      error: 'Failed to save config',
    })
  })

  it('reports a transport failure’s message', () => {
    expect(interpretStoreReply({ message: 'port closed' }, undefined, options)).toEqual({
      success: false,
      error: 'port closed',
    })
  })

  it('prefixes a transport failure when asked to', () => {
    expect(
      interpretStoreReply({ message: 'port closed' }, undefined, {
        ...options,
        transportErrorPrefix: 'Failed to save data to storage: ',
      }),
    ).toEqual({ success: false, error: 'Failed to save data to storage: port closed' })
  })

  it('tolerates a transport failure with no message', () => {
    expect(interpretStoreReply({}, undefined, options)).toEqual({ success: false, error: '' })
  })

  it('prefers the transport failure over a reply', () => {
    expect(interpretStoreReply({ message: 'port closed' }, { success: true }, options)).toEqual({
      success: false,
      error: 'port closed',
    })
  })
})

describe('createMessageHandler', () => {
  let state: ContentScriptState
  let deps: {
    enablePickerMode: ReturnType<typeof vi.fn<(source?: string) => Promise<void>>>
    disablePickerMode: ReturnType<typeof vi.fn<(source?: string) => void>>
  }
  let handle: ReturnType<typeof createMessageHandler>
  let sendResponse: ReturnType<typeof vi.fn<(response: unknown) => void>>
  let sendMessage: ReturnType<typeof vi.fn>

  /** Reply to the background's UPDATE_SIDEPANEL_DATA with `response`. */
  const backgroundReplies = (response: unknown, lastError?: { message?: string }) => {
    sendMessage.mockImplementation((_message: unknown, callback?: (r: unknown) => void) => {
      setLastError(lastError)
      callback?.(response)
      setLastError(undefined)
    })
  }

  beforeEach(() => {
    fakeBrowser.reset()
    setLastError(undefined)
    document.body.innerHTML = '<ul><li>a</li><li>b</li></ul>'
    state = createState()
    state.tabId = 3
    deps = {
      enablePickerMode: vi.fn<(source?: string) => Promise<void>>().mockResolvedValue(undefined),
      disablePickerMode: vi.fn<(source?: string) => void>(),
    }
    handle = createMessageHandler(state, deps)
    sendResponse = vi.fn()
    sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage') as ReturnType<typeof vi.fn>
    backgroundReplies({ success: true })
  })

  const dispatch = (message: Message) => handle(message, {}, sendResponse)

  describe('START_SCRAPE', () => {
    const scrape = () =>
      dispatch({
        type: MESSAGE_TYPES.START_SCRAPE,
        payload: { mainSelector: '//li', columns: [{ name: 'Item', selector: '.' }] },
      })

    it('scrapes, stores the result and reports how many rows it found', () => {
      expect(scrape()).toBe(true)

      expect(sendMessage).toHaveBeenCalledWith(
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: 3,
            updates: {
              scrapeResult: {
                columnOrder: ['Item'],
                data: [
                  { data: { Item: 'a' }, metadata: { originalIndex: 0, isEmpty: false } },
                  { data: { Item: 'b' }, metadata: { originalIndex: 1, isEmpty: false } },
                ],
              },
            },
          },
        },
        expect.any(Function),
      )
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Scraped 2 items successfully and stored in session.',
        }),
      )
    })

    it('tracks the completed scrape', () => {
      scrape()

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SCRAPE_COMPLETION, {
        items_scraped: 2,
        columns_count: 1,
      })
    })

    it('refuses to store before the tab id is known', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      state.tabId = null

      expect(scrape()).toBe(true)

      expect(sendMessage).not.toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId not initialized in content script.',
      })
    })

    it('reports a transport failure with a storage prefix', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      backgroundReplies(undefined, { message: 'port closed' })

      scrape()

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to save data to storage: port closed',
      })
    })

    it('reports the background’s refusal', () => {
      backgroundReplies({ success: false, error: 'session gone' })

      scrape()

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'session gone' })
    })
  })

  describe('HIGHLIGHT_ELEMENTS', () => {
    it('highlights the matches and reports the count', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//li' } })

      expect(highlightMocks.highlightMatchingElements).toHaveBeenCalledWith(
        [...document.querySelectorAll('li')],
        { shouldScroll: undefined },
      )
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Elements highlighted successfully.',
        matchCount: 2,
      })
    })

    it('passes the scroll preference through', () => {
      dispatch({
        type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
        payload: { selector: '//li', shouldScroll: false },
      })

      expect(highlightMocks.highlightMatchingElements).toHaveBeenCalledWith(expect.anything(), {
        shouldScroll: false,
      })
    })

    it('tracks the highlight as a whole-selector highlight', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//li' } })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
        elements_count: 2,
        is_row_highlight: false,
      })
    })

    it('reports a zero match count when nothing matches', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//table' } })

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ matchCount: 0 }))
    })

    it('reports a malformed selector without highlighting', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS, payload: { selector: '//[[' } })

      expect(highlightMocks.highlightMatchingElements).not.toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: expect.any(String) })
    })

    it('treats a missing payload as an empty one', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS })

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: expect.any(String) })
    })
  })

  describe('HIGHLIGHT_ROW_ELEMENT', () => {
    it('highlights the row and reports success', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT, payload: { selector: '(//li)[1]' } })

      expect(highlightMocks.highlightMatchingElements).toHaveBeenCalledWith([
        document.querySelector('li'),
      ])
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Row element highlighted successfully.',
      })
    })

    it('tracks the highlight as a row highlight', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT, payload: { selector: '(//li)[1]' } })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ELEMENTS_HIGHLIGHT, {
        elements_count: 1,
        is_row_highlight: true,
      })
    })

    it('reports a malformed selector without highlighting', () => {
      dispatch({ type: MESSAGE_TYPES.HIGHLIGHT_ROW_ELEMENT, payload: { selector: '//[[' } })

      expect(highlightMocks.highlightMatchingElements).not.toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: expect.any(String) })
    })
  })

  describe('picker mode', () => {
    it('enables the picker, forwarding the source', () => {
      dispatch({ type: MESSAGE_TYPES.ENABLE_PICKER_MODE, payload: { source: 'demo_scrape' } })

      expect(deps.enablePickerMode).toHaveBeenCalledWith('demo_scrape')
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Picker mode enabled',
      })
    })

    it('enables the picker with no source when the payload is missing', () => {
      dispatch({ type: MESSAGE_TYPES.ENABLE_PICKER_MODE })

      expect(deps.enablePickerMode).toHaveBeenCalledWith(undefined)
    })

    it('disables the picker, forwarding the source', () => {
      dispatch({ type: MESSAGE_TYPES.DISABLE_PICKER_MODE, payload: { source: 'banner' } })

      expect(deps.disablePickerMode).toHaveBeenCalledWith('banner')
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Picker mode disabled',
      })
    })

    it('disables the picker with no source when the payload is missing', () => {
      dispatch({ type: MESSAGE_TYPES.DISABLE_PICKER_MODE })

      expect(deps.disablePickerMode).toHaveBeenCalledWith(undefined)
    })

    it('toggles the picker on when it is off', () => {
      dispatch({ type: MESSAGE_TYPES.TOGGLE_PICKER_MODE, payload: { source: 'keyboard' } })

      expect(deps.enablePickerMode).toHaveBeenCalledWith('keyboard')
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Picker mode enabled',
      })
    })

    it('toggles the picker off when it is on', () => {
      state.pickerModeActive = true

      dispatch({ type: MESSAGE_TYPES.TOGGLE_PICKER_MODE, payload: { source: 'keyboard' } })

      expect(deps.disablePickerMode).toHaveBeenCalledWith('keyboard')
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Picker mode disabled',
      })
    })

    it('defaults the toggle source to the button', () => {
      dispatch({ type: MESSAGE_TYPES.TOGGLE_PICKER_MODE })

      expect(deps.enablePickerMode).toHaveBeenCalledWith('button')
    })

    it('defaults the toggle-off source to the button', () => {
      state.pickerModeActive = true

      dispatch({ type: MESSAGE_TYPES.TOGGLE_PICKER_MODE, payload: {} })

      expect(deps.disablePickerMode).toHaveBeenCalledWith('button')
    })
  })

  describe('SAVE_ELEMENT_DETAILS_TO_STORAGE', () => {
    const rememberRightClick = () => {
      const element = document.querySelector<HTMLElement>('li')!
      state.lastRightClickedElement = element
      state.lastRightClickedElementDetails = {
        xpath: '/html/body/ul/li[1]',
        text: 'a',
        html: '<li>a</li>',
      }
      return element
    }

    it('stores the guessed config alongside the element details', () => {
      rememberRightClick()

      expect(dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })).toBe(true)

      expect(sendMessage).toHaveBeenCalledWith(
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: 3,
            updates: {
              currentScrapeConfig: expect.objectContaining({ columns: expect.any(Array) }),
              elementDetails: state.lastRightClickedElementDetails,
            },
          },
        },
        expect.any(Function),
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('refuses when no element has been right-clicked', () => {
      vi.spyOn(log, 'warn').mockImplementation(() => {})

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No element details in memory.',
      })
    })

    it('refuses when the element is remembered but its details are not', () => {
      vi.spyOn(log, 'warn').mockImplementation(() => {})
      state.lastRightClickedElement = document.querySelector<HTMLElement>('li')!

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No element details in memory.',
      })
    })

    it('refuses before the tab id is known', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      rememberRightClick()
      state.tabId = null

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId not initialized in content script.',
      })
    })

    it('reports a transport failure', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      rememberRightClick()
      backgroundReplies(undefined, { message: 'port closed' })

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'port closed' })
    })

    it('reports the background’s refusal', () => {
      rememberRightClick()
      backgroundReplies({ success: false })

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to save config',
      })
    })

    it('reports a failure to guess the config', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      rememberRightClick()
      // A detached element has no tag name to dispatch on.
      state.lastRightClickedElement = {} as HTMLElement

      dispatch({ type: MESSAGE_TYPES.SAVE_ELEMENT_DETAILS_TO_STORAGE })

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: expect.any(String) })
    })
  })

  describe('GUESS_CONFIG_FROM_SELECTOR', () => {
    const guess = (mainSelector?: string) =>
      dispatch({ type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR, payload: { mainSelector } })

    it('guesses from the first match and keeps the given selector', () => {
      expect(guess('//li')).toBe(true)

      expect(sendMessage).toHaveBeenCalledWith(
        {
          type: MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA,
          payload: {
            tabId: 3,
            updates: {
              currentScrapeConfig: expect.objectContaining({ mainSelector: '//li' }),
            },
          },
        },
        expect.any(Function),
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
    })

    it('refuses a missing selector', () => {
      guess()

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Missing mainSelector' })
    })

    it('refuses a blank selector', () => {
      guess('   ')

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Missing mainSelector' })
    })

    it('refuses a message with no payload', () => {
      dispatch({ type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR })

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Missing mainSelector' })
    })

    it('refuses before the tab id is known', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      state.tabId = null

      guess('//li')

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'tabId not initialized in content script.',
      })
    })

    it('refuses a selector that matches nothing', () => {
      guess('//table')

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No elements found for selector',
      })
    })

    it('reports a transport failure', () => {
      vi.spyOn(log, 'error').mockImplementation(() => {})
      backgroundReplies(undefined, { message: 'port closed' })

      guess('//li')

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'port closed' })
    })

    it('reports the background’s refusal', () => {
      backgroundReplies({ success: false })

      guess('//li')

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to save config',
      })
    })
  })

  it('ignores message types it does not handle', () => {
    expect(dispatch({ type: 'no-such-type' })).toBeUndefined()

    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('logs and swallows an error thrown while handling a message', () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('picker unavailable')
    deps.enablePickerMode.mockImplementation(() => {
      throw failure
    })

    expect(dispatch({ type: MESSAGE_TYPES.ENABLE_PICKER_MODE })).toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith('Error in content script:', failure)
  })
})
