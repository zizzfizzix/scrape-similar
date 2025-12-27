import { isInjectableUrl } from '@/utils/isInjectableUrl'
import log from 'loglevel'

/**
 * Handle keyboard shortcuts (global commands)
 */
export const setupCommandsListener = (): void => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle_visual_picker') return
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!activeTab?.id || !isInjectableUrl(activeTab.url)) return

      await browser.sidePanel.setOptions({
        tabId: activeTab.id,
        path: `sidepanel.html`,
        enabled: true,
      })

      await browser.tabs.sendMessage(activeTab.id, {
        type: MESSAGE_TYPES.TOGGLE_PICKER_MODE,
        payload: { source: 'keyboard_shortcut' },
      })
      log.debug('Visual picker toggled via global keyboard command')
    } catch (error) {
      log.error('Error handling toggle_visual_picker command (global):', error)
    }
  })
}
