import { createMessageHandler } from '@/entrypoints/content/handlers'
import { disablePickerMode, enablePickerMode } from '@/entrypoints/content/picker'
import { createState, type ContentScriptState } from '@/entrypoints/content/state'
import { isDevOrTest } from '@/utils/modeTest'
import { minimizeXPath } from '@/utils/scraper'
import { MESSAGE_TYPES, type Message, type MessageResponse } from '@/utils/types'
import log from 'loglevel'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

/**
 * What the content script does on injection.
 *
 * Split out of `index.ts` so everything but the `defineContentScript` wrapper —
 * log level, tab id, right-click tracking and message wiring — can be exercised
 * without a real content-script context.
 */

/**
 * Follow the debug-mode flag.
 *
 * Content scripts have no direct storage access, so the current value is
 * requested from the background and later changes arrive as broadcasts.
 */
export const applyDebugMode = (): void => {
  if (isDevOrTest) {
    log.setLevel('trace')
    return
  }

  browser.runtime.sendMessage(
    { type: MESSAGE_TYPES.GET_DEBUG_MODE },
    (response: MessageResponse) => {
      if (
        response.success === true &&
        'debugMode' in response &&
        typeof response.debugMode === 'boolean'
      ) {
        log.setLevel(response.debugMode ? 'trace' : 'error')
      }
    },
  )

  browser.runtime.onMessage.addListener((msg: Message) => {
    if (msg.type === MESSAGE_TYPES.DEBUG_MODE_CHANGED) {
      const { debugMode } = (msg.payload as { debugMode: boolean }) || { debugMode: false }
      log.setLevel(debugMode ? 'trace' : 'error')
    }
  })
}

/**
 * Learn which tab this script runs in.
 *
 * Nothing else works without it — messages back to the side panel are addressed
 * by tab id — so a missing id is fatal rather than degraded.
 */
export const requestTabId = (state: ContentScriptState): void => {
  browser.runtime.sendMessage({ type: 'GET_MY_TAB_ID' }, (response: MessageResponse) => {
    if (
      response.success === false ||
      !('tabId' in response) ||
      typeof response.tabId !== 'number'
    ) {
      log.error(
        'Failed to get tabId on content script initialization:',
        browser.runtime.lastError?.message || response,
      )
      throw new Error('Content script cannot function without tabId.')
    }
    state.tabId = response.tabId
    log.debug('Content script initialized with tabId:', state.tabId)
  })
}

/**
 * Remember what was right-clicked, so "Scrape similar" knows where to start.
 *
 * Also records the pointer position, which the visual picker uses when it is
 * opened from the context menu.
 */
export const trackContextMenuTarget = (state: ContentScriptState, event: MouseEvent): void => {
  log.debug('Context menu event captured', event.target)

  state.lastRightClickedElement = event.target as HTMLElement
  if (state.lastRightClickedElement) {
    const selector = minimizeXPath(state.lastRightClickedElement)
    state.lastRightClickedElementDetails = {
      xpath: selector,
      text: state.lastRightClickedElement.textContent || '',
      html: state.lastRightClickedElement.outerHTML,
    }
  }

  state.lastMouseX = event.clientX
  state.lastMouseY = event.clientY
}

export const startContentScript = (ctx: ContentScriptContext): ContentScriptState => {
  applyDebugMode()

  log.info('Scrape Similar content script is running')

  const state = createState()
  requestTabId(state)

  document.addEventListener('contextmenu', (event) => {
    trackContextMenuTarget(state, event as MouseEvent)
  })

  const enablePicker = (source?: string) => enablePickerMode(ctx, state, disablePicker, source)
  const disablePicker = (source?: string) => disablePickerMode(state, source)

  browser.runtime.onMessage.addListener(
    createMessageHandler(state, {
      enablePickerMode: enablePicker,
      disablePickerMode: disablePicker,
    }),
  )
  log.debug('Content script: Message listener added')

  return state
}
