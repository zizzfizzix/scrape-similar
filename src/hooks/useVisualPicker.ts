import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { MESSAGE_TYPES } from '@/utils/types'

interface UseVisualPickerOptions {
  /** Called when a selector is picked from the visual picker */
  onSelectorPicked: (selector: string) => void
}

interface UseVisualPickerReturn {
  /** Whether the picker tab is currently open/active */
  isPickerActive: boolean
  /** Opens a URL in a new tab and enables picker mode */
  openPicker: (url: string) => Promise<void>
  /** Closes the picker tab if open */
  closePicker: () => void
}

/**
 * Hook to manage visual picker functionality for batch scrape.
 * Opens a URL in a new tab, enables picker mode, and handles selector selection.
 */
export const useVisualPicker = (options: UseVisualPickerOptions): UseVisualPickerReturn => {
  const { onSelectorPicked } = options
  const [pickerTabId, setPickerTabId] = useState<number | null>(null)

  // Use ref to avoid stale closure issues in message listener
  const onSelectorPickedRef = useRef(onSelectorPicked)
  useEffect(() => {
    onSelectorPickedRef.current = onSelectorPicked
  }, [onSelectorPicked])

  // Close picker tab
  const closePicker = useCallback(() => {
    if (pickerTabId) {
      browser.tabs.remove(pickerTabId).catch(() => {
        // Tab may already be closed
      })
      setPickerTabId(null)
    }
  }, [pickerTabId])

  // Open a URL in a new tab and enable picker mode
  const openPicker = useCallback(async (url: string) => {
    try {
      // Open tab with URL
      const tab = await browser.tabs.create({ url, active: true })
      if (!tab.id) {
        toast.error('Failed to open tab')
        return
      }

      const tabId = tab.id
      setPickerTabId(tabId)

      // Cleanup function that can be called from any path
      let timeoutId: NodeJS.Timeout | undefined
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        browser.tabs.onUpdated.removeListener(handleTabUpdated)
      }

      // Listen for tab to complete loading
      const handleTabUpdated = (updatedTabId: number, changeInfo: any) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          // Clean up listener and timeout
          cleanup()

          // Enable picker mode
          browser.tabs.sendMessage(
            tabId,
            {
              type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
              payload: { source: 'batch-scrape' },
            },
            (response) => {
              if (!response || !response.success) {
                toast.error('Failed to enable picker mode')
                browser.tabs.remove(tabId).catch(() => {})
                setPickerTabId(null)
              }
            },
          )
        }
      }

      // Set up timeout for tab loading
      timeoutId = setTimeout(() => {
        cleanup() // Ensure listener is removed on timeout
        toast.error('Tab took too long to load')
        browser.tabs.remove(tabId).catch(() => {})
        setPickerTabId(null)
      }, 10000) // 10 second timeout

      browser.tabs.onUpdated.addListener(handleTabUpdated)
    } catch (err) {
      toast.error('Failed to open picker tab')
    }
  }, [])

  // Listen for picker selection via UPDATE_SIDEPANEL_DATA
  useEffect(() => {
    if (!pickerTabId) return

    const handleMessage = (
      message: any,
      sender: Browser.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      // Only handle messages from our picker tab
      if (sender.tab?.id !== pickerTabId) return

      // Listen for config updates from picker tab
      if (
        message.type === MESSAGE_TYPES.UPDATE_SIDEPANEL_DATA &&
        message.payload?.updates?.currentScrapeConfig
      ) {
        const selector = message.payload.updates.currentScrapeConfig.mainSelector
        if (selector) {
          onSelectorPickedRef.current(selector)
          toast.success('Selector updated from picker')
        }

        // Close picker tab
        browser.tabs.remove(pickerTabId).catch(() => {})
        setPickerTabId(null)

        sendResponse({ success: true })
        return true
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage)
    }
  }, [pickerTabId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pickerTabId) {
        browser.tabs.remove(pickerTabId).catch(() => {})
      }
    }
  }, [pickerTabId])

  return {
    isPickerActive: pickerTabId !== null,
    openPicker,
    closePicker,
  }
}
