import { handleContentScriptMessage } from '@/entrypoints/background/handlers/content-script'
import { handleUiMessage } from '@/entrypoints/background/handlers/ui'
import { applySidePanelDataUpdates } from '@/entrypoints/background/services/session-storage'
import log from 'loglevel'

/**
 * Main message router - determines message source and dispatches to appropriate handler
 */
export const setupMessageListener = (): void => {
  browser.runtime.onMessage.addListener(
    (
      message: Message,
      sender: Browser.runtime.MessageSender,
      sendResponse: (response?: MessageResponse) => void,
    ) => {
      log.debug('Background received message:', message, 'from sender:', sender)

      // Special logging for EXPORT_TO_SHEETS messages
      if (message.type === MESSAGE_TYPES.EXPORT_TO_SHEETS) {
        log.debug('🔥 EXPORT_TO_SHEETS message received:', {
          messageType: message.type,
          hasPayload: !!message.payload,
          payloadKeys: message.payload ? Object.keys(message.payload) : [],
          senderTab: sender.tab?.id || 'no-tab',
          senderUrl: sender.url || 'no-url',
        })
      }

      // Handle UPDATE_SIDEPANEL_DATA universally before delegating
      if (message.type === MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA) {
        const { tabId: explicitTabId, updates } = (message.payload ?? {}) as {
          tabId?: number
          updates: Partial<SidePanelConfig>
        }
        const targetId = explicitTabId ?? sender.tab?.id
        if (typeof targetId !== 'number' || !updates) {
          sendResponse({ success: false, error: 'tabId or sender.tab.id required' })
          return true
        }
        applySidePanelDataUpdates(targetId, updates)
          .then(() => sendResponse({ success: true }))
          .catch((error) => {
            log.error('Error updating sidepanel state:', error)
            sendResponse({ success: false, error: (error as Error).message })
          })
        return true // handled
      }

      // Determine if this is from an extension page or a content script
      // Extension pages (onboarding, options, etc.) have sender.url starting with chrome-extension://
      const isExtensionPage = sender.url?.startsWith(browser.runtime.getURL(''))

      // Handle messages from content script (on web pages) vs UI (extension pages, sidepanel, popup)
      if (sender.tab && sender.tab.id && !isExtensionPage) {
        log.debug('🔵 Routing to handleContentScriptMessage - sender has tab:', sender.tab.id)
        log.debug('🔵 Sender URL:', sender.url)
        log.debug('🔵 Message type:', message.type)
        handleContentScriptMessage(message, sender, sendResponse)
      }
      // Handle messages from UI (side panel, popup, extension pages like onboarding)
      else {
        log.debug('🟡 Routing to handleUiMessage - extension page or no tab')
        log.debug('🟡 Sender URL:', sender.url)
        log.debug('🟡 Message type:', message.type)
        log.debug('🟡 Is extension page:', isExtensionPage)
        handleUiMessage(message, sender, sendResponse)
      }

      // Return true to indicate async response possibility
      return true
    },
  )
}
