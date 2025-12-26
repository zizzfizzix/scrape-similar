import { createMessageHandler } from '@/entrypoints/content/handlers'
import { disablePickerMode, enablePickerMode } from '@/entrypoints/content/picker'
import { isDevOrTest } from '@/utils/modeTest'
import { minimizeXPath } from '@/utils/scraper'
import { MESSAGE_TYPES, type Message, type MessageResponse } from '@/utils/types'
import log from 'loglevel'
import { createState } from './state'

log.setDefaultLevel('error')

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    // Always log at trace level in development or test mode
    if (isDevOrTest) {
      log.setLevel('trace')
    } else {
      // Request current debug mode from the background script since content scripts
      // do not have direct access to extension storage APIs.
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

      // Listen for debug mode changes broadcast from the background script
      browser.runtime.onMessage.addListener((msg: Message) => {
        if (msg.type === MESSAGE_TYPES.DEBUG_MODE_CHANGED) {
          const { debugMode } = (msg.payload as { debugMode: boolean }) || { debugMode: false }
          log.setLevel(debugMode ? 'trace' : 'error')
        }
      })
    }

    log.info('Scrape Similar content script is running')

    // Create state container
    const state = createState()

    // Request tabId on initialization and throw if not available
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

    // Handle right-click for later element selection
    const rightClickListener = (event: MouseEvent) => {
      state.lastRightClickedElement = event.target as HTMLElement
      if (state.lastRightClickedElement) {
        const selector = minimizeXPath(state.lastRightClickedElement)
        state.lastRightClickedElementDetails = {
          xpath: selector,
          text: state.lastRightClickedElement.textContent || '',
          html: state.lastRightClickedElement.outerHTML,
        }
      }
    }

    // Listen for context menu events to capture target element
    document.addEventListener('contextmenu', (event) => {
      log.debug('Context menu event captured', event.target)
      rightClickListener(event as MouseEvent)
      // Also track position for visual picker (in case it's triggered via context menu)
      state.lastMouseX = event.clientX
      state.lastMouseY = event.clientY
    })

    // Create picker mode functions with state binding
    const enablePicker = () => enablePickerMode(ctx, state, disablePicker)
    const disablePicker = () => disablePickerMode(state)

    // Create message handler
    const messageHandler = createMessageHandler(state, {
      enablePickerMode: enablePicker,
      disablePickerMode: disablePicker,
    })

    // Set up message listener
    browser.runtime.onMessage.addListener(messageHandler)
    log.debug('Content script: Message listener added')
  },
})
