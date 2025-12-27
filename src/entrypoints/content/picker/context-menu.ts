import { highlightElementsForPicker } from '@/entrypoints/content/highlight'
import type { ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { evaluateXPath } from '@/utils/scraper'
import log from 'loglevel'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

const SCROLL_THRESHOLD = 38 // pixels of scroll needed to change one level

/**
 * Handle level change in context menu
 */
export const handleLevelChange = (
  level: number,
  state: ContentScriptState,
  onUpdate: (matches: number, xpath: string) => void,
  method?: 'slider' | 'keyboard' | 'scroll',
): void => {
  const maxIndex = state.selectorCandidates.length - 1
  if (level !== state.selectedCandidateIndex && level >= 0 && level <= maxIndex) {
    const fromLevel = state.selectedCandidateIndex
    state.selectedCandidateIndex = level
    const sel = state.selectorCandidates[state.selectedCandidateIndex]
    state.currentXPath = sel
    const matches = evaluateXPath(sel)
    highlightElementsForPicker(matches as HTMLElement[], state.highlightedElements)
    onUpdate(matches.length, sel)

    // Track level change
    trackEvent(ANALYTICS_EVENTS.PICKER_LEVEL_CHANGE, {
      from_level: fromLevel,
      to_level: level,
      method: method || 'unknown',
    })
  }
}

/**
 * Show the picker context menu
 */
export const showPickerContextMenu = async (
  x: number,
  y: number,
  ctx: ContentScriptContext,
  state: ContentScriptState,
  onLevelChange: (level: number, method?: 'slider' | 'keyboard' | 'scroll') => void,
  onClose: () => void,
  removeCrosshairCursor: () => void,
): Promise<void> => {
  state.contextMenuX = x
  state.contextMenuY = y

  // Create wheel handler if not exists
  if (!state.contextMenuWheelHandler) {
    state.contextMenuWheelHandler = (e: WheelEvent) =>
      handlePickerContextMenuWheel(e, state, onLevelChange)
  }

  // If already open, just update state (don't track again)
  if (state.pickerContextMenuUi && state.pickerContextMenuApi) {
    state.pickerContextMenuApi.updateLevels(
      state.selectorCandidates.length,
      state.selectedCandidateIndex,
    )
    state.pickerContextMenuApi.updatePosition(x, y)
    state.pickerContextMenuOpen = true
    removeCrosshairCursor()
    document.addEventListener('wheel', state.contextMenuWheelHandler, {
      passive: false,
    })
    state.pickerScrollAccumulator = 0
    return
  }

  // Track context menu open (only when newly opening, not updating position)
  trackEvent(ANALYTICS_EVENTS.PICKER_CONTEXT_MENU_OPEN, {
    levels_available: state.selectorCandidates.length,
  })

  // Create shadow root UI using WXT's helper (handles CSS injection)
  try {
    const ui = await createShadowRootUi(ctx, {
      name: 'scrape-similar-context-menu',
      position: 'inline',
      anchor: 'body',
      onMount: (container: HTMLElement) => {
        const appRoot = document.createElement('div')
        container.appendChild(appRoot)
        state.pickerContextMenuHost = container as HTMLDivElement

        // Dynamically import and mount the React component
        import('@/entrypoints/content/ui/PickerContextMenu').then((mod) => {
          const { mountPickerContextMenuReact } = mod
          const api = mountPickerContextMenuReact(
            appRoot,
            {
              x: state.contextMenuX,
              y: state.contextMenuY,
              levels: state.selectorCandidates.length,
              currentLevel: state.selectedCandidateIndex,
              onChange: (level: number) => onLevelChange(level, 'slider'),
              onClose,
            },
            container,
          )
          state.pickerContextMenuApi = api
          // Store unmount function for cleanup
          ;(appRoot as { __unmount?: () => void }).__unmount = api.unmount
        })
        return appRoot
      },
      onRemove: (appRoot?: HTMLElement) => {
        try {
          const unmount = (appRoot as { __unmount?: () => void } | undefined)?.__unmount
          if (typeof unmount === 'function') unmount()
        } catch {}
        state.pickerContextMenuHost = null
        state.pickerContextMenuApi = null
      },
    })
    state.pickerContextMenuUi = ui
    ui.mount()
  } catch (e) {
    log.warn('Failed to mount picker context menu', e)
    removePickerContextMenu(state, removeCrosshairCursor, () => {})
    return
  }

  state.pickerContextMenuOpen = true
  removeCrosshairCursor()
  document.addEventListener('wheel', state.contextMenuWheelHandler, {
    passive: false,
  })
  state.pickerScrollAccumulator = 0
}

/**
 * Handle wheel events for context menu level selection
 */
export const handlePickerContextMenuWheel = (
  event: WheelEvent,
  state: ContentScriptState,
  onLevelChange: (level: number, method?: 'slider' | 'keyboard' | 'scroll') => void,
): void => {
  // Prevent page scroll
  event.preventDefault()
  event.stopPropagation()

  if (!state.pickerContextMenuApi) return

  const maxIndex = state.selectorCandidates.length - 1
  if (maxIndex <= 0) return

  // Accumulate scroll delta (respects system scroll direction)
  state.pickerScrollAccumulator += event.deltaY

  // Only change level when accumulated scroll exceeds threshold
  if (Math.abs(state.pickerScrollAccumulator) < SCROLL_THRESHOLD) return

  // Calculate how many levels to move
  const levels = Math.trunc(state.pickerScrollAccumulator / SCROLL_THRESHOLD)
  state.pickerScrollAccumulator = state.pickerScrollAccumulator % SCROLL_THRESHOLD

  // Scroll down (positive deltaY) = more specific (decrease index)
  // Scroll up (negative deltaY) = more broad (increase index)
  // This matches the visual direction: scroll gesture moves the indicator in the same direction
  const newIndex = Math.max(0, Math.min(maxIndex, state.selectedCandidateIndex - levels))
  if (newIndex !== state.selectedCandidateIndex) {
    onLevelChange(newIndex, 'scroll')
    state.pickerContextMenuApi.updateLevel(newIndex)
  }
}

/**
 * Remove the picker context menu
 */
export const removePickerContextMenu = (
  state: ContentScriptState,
  removeCrosshairCursor: () => void,
  applyCrosshairCursor: () => void,
): void => {
  // Remove scroll lock using stored handler reference
  if (state.contextMenuWheelHandler) {
    document.removeEventListener('wheel', state.contextMenuWheelHandler)
  }

  // Remove the shadow root UI
  if (state.pickerContextMenuUi) {
    try {
      state.pickerContextMenuUi.remove()
    } catch {}
    state.pickerContextMenuUi = null
  }

  state.pickerContextMenuHost = null
  state.pickerContextMenuApi = null
  state.pickerContextMenuOpen = false

  // Restore crosshair cursor if picker mode is still active
  if (state.pickerModeActive) {
    applyCrosshairCursor()
  }
}

/**
 * Handle context menu event (right-click in picker mode)
 */
export const handlePickerContextMenu = (
  event: MouseEvent,
  state: ContentScriptState,
  showContextMenu: (x: number, y: number) => Promise<void>,
): void => {
  if (!state.pickerModeActive) return

  // Check if the right-click is on extension UI elements
  const composedPath = event.composedPath()

  // Don't show context menu if right-clicking on the banner
  if (state.bannerRootEl && composedPath.includes(state.bannerRootEl)) {
    return
  }

  // Don't show context menu if right-clicking on the context menu itself
  if (state.pickerContextMenuHost && composedPath.includes(state.pickerContextMenuHost)) {
    return
  }

  // Don't show context menu if right-clicking on any extension UI (shadow roots)
  if (composedPath.some((el) => el instanceof Element && el.hasAttribute('data-wxt-shadow-root'))) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  showContextMenu(event.clientX, event.clientY)
}

/**
 * Handle click outside context menu to close it
 */
export const handlePickerContextMenuClickOutside = (
  event: MouseEvent,
  state: ContentScriptState,
  removeContextMenu: () => void,
): void => {
  if (
    state.pickerContextMenuHost &&
    state.pickerContextMenuOpen &&
    !event.composedPath().includes(state.pickerContextMenuHost)
  ) {
    removeContextMenu()
  }
}
