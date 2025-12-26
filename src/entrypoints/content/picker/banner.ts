import type { ContentScriptState } from '@/entrypoints/content/state'
import log from 'loglevel'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

/**
 * Get the height of the picker banner
 */
export const getPickerBannerHeight = (state: ContentScriptState): number => {
  if (!state.bannerRootEl) return 53
  const shadowRoot = state.bannerRootEl.shadowRoot || state.bannerRootEl.getRootNode()
  const bannerEl = (shadowRoot as ShadowRoot)?.querySelector?.('.fixed') as HTMLElement | null
  return bannerEl?.getBoundingClientRect().height || 53
}

/**
 * Adjust fixed/sticky elements at the top of the page to account for banner
 */
export const adjustFixedElementsForBanner = (
  bannerHeight: number,
  state: ContentScriptState,
): void => {
  // Find all fixed/sticky elements at the top of the page
  const allElements = document.querySelectorAll('*')
  allElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return
    // Skip our own elements
    if (el.closest('[data-wxt-shadow-root]')) return

    const style = getComputedStyle(el)
    const position = style.position
    const top = style.top

    // Check if element is fixed or sticky with top: 0 (or close to 0)
    if ((position === 'fixed' || position === 'sticky') && top !== 'auto') {
      const topValue = parseFloat(top) || 0
      if (topValue >= 0 && topValue < bannerHeight) {
        // Store original inline top value if not already stored
        if (!state.originalFixedElementTops.has(el)) {
          state.originalFixedElementTops.set(el, el.style.top)
        }
        // Adjust top to be below the banner
        el.style.setProperty('top', `${topValue + bannerHeight}px`, 'important')
      }
    }
  })
}

/**
 * Restore fixed/sticky elements to their original positions
 */
export const restoreFixedElements = (state: ContentScriptState): void => {
  state.originalFixedElementTops.forEach((originalTop, el) => {
    if (originalTop) {
      el.style.top = originalTop
    } else {
      el.style.removeProperty('top')
    }
  })
  state.originalFixedElementTops.clear()
}

/**
 * Update body margin to account for banner height
 */
export const updateBodyMarginForBanner = (state: ContentScriptState): void => {
  if (!state.pickerModeActive || !state.bannerRootEl) return

  const height = getPickerBannerHeight(state)

  if (state.originalBodyMarginTopInline === null) {
    state.originalBodyMarginTopInline = document.documentElement.style.marginTop
  }
  if (state.originalBodyMarginTopComputedPx === null) {
    const computed = parseFloat(getComputedStyle(document.documentElement).marginTop || '0') || 0
    state.originalBodyMarginTopComputedPx = computed
  }
  const base = state.originalBodyMarginTopComputedPx || 0
  document.documentElement.style.setProperty('margin-top', `${base + height}px`, 'important')

  // Adjust fixed/sticky elements at the top
  adjustFixedElementsForBanner(height, state)
}

/**
 * Update picker banner content (count and xpath)
 */
export const updatePickerBannerContent = (
  matches: number,
  xpath: string,
  state: ContentScriptState,
): void => {
  if (state.bannerCountEl) state.bannerCountEl.textContent = String(matches)
  if (state.bannerXPathEl) state.bannerXPathEl.value = xpath
  if (typeof state.bannerSetData === 'function') state.bannerSetData(matches, xpath)
  updateBodyMarginForBanner(state)
}

/**
 * Mount the picker banner UI
 */
export const mountPickerBanner = async (
  ctx: ContentScriptContext,
  state: ContentScriptState,
  onClose: () => void,
): Promise<void> => {
  if (state.pickerBannerUi) return
  try {
    // Import the React banner module first (before creating the shadow root)
    const { mountPickerBannerReact } = await import('@/entrypoints/content/ui/PickerBanner')

    // Track the ready promise from React mount
    let reactReadyPromise: Promise<void> | undefined

    const ui = await createShadowRootUi(ctx, {
      name: 'scrape-similar-picker-banner',
      position: 'inline',
      anchor: 'body',
      onMount: (container: HTMLElement) => {
        const appRoot = document.createElement('div')
        container.appendChild(appRoot)
        const api = mountPickerBannerReact(appRoot, {
          getState: () => ({
            count: 0,
            xpath: state.currentXPath,
          }),
          onClose,
        })
        state.bannerSetData = api.setData
        reactReadyPromise = api.ready
        // Store unmount function for cleanup
        ;(appRoot as { __unmount?: () => void }).__unmount = api.unmount
        state.bannerRootEl = container as HTMLDivElement
        return appRoot
      },
      onRemove: (appRoot?: HTMLElement) => {
        try {
          const unmount = (appRoot as { __unmount?: () => void } | undefined)?.__unmount
          if (typeof unmount === 'function') unmount()
        } catch {}
        state.bannerRootEl = null
        state.bannerCountEl = null
        state.bannerXPathEl = null
        state.bannerCloseBtn = null
        state.bannerSetData = null
      },
    })
    state.pickerBannerUi = ui
    ui.mount()

    // Wait for React to complete its first render
    if (reactReadyPromise) {
      await reactReadyPromise
    }

    // After mount, ensure page content is offset below banner
    updateBodyMarginForBanner(state)
  } catch (e) {
    log.warn('Failed to mount picker banner UI', e)
  }
}

/**
 * Unmount the picker banner UI
 */
export const unmountPickerBanner = (state: ContentScriptState): void => {
  try {
    if (state.pickerBannerUi) {
      state.pickerBannerUi.remove?.()
      state.pickerBannerUi = null
    }
  } catch (e) {
    // ignore
  }
}
