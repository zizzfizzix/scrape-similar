/**
 * Background-specific types for message handling and internal operations
 */

export type MessageHandler = (
  message: Message,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response?: MessageResponse) => void,
) => Promise<void> | void

/**
 * A dispatcher rather than a single handler. Always async, so the router — which
 * must return `true` synchronously to keep the message channel open — has a
 * promise to attach a rejection handler to.
 */
export type AsyncMessageHandler = (...args: Parameters<MessageHandler>) => Promise<void>

export interface QueuedEvent {
  name: string
  props: Record<string, any>
  timestamp: number
}

export interface ExportResult {
  success: boolean
  url?: string
  error?: string
}
