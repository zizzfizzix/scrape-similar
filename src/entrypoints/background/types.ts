/**
 * Background-specific types for message handling and internal operations
 */

export type MessageHandler = (
  message: Message,
  sender: Browser.runtime.MessageSender,
  sendResponse: (response?: MessageResponse) => void,
) => Promise<void> | void

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
