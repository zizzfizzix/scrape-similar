// @vitest-environment jsdom
import type { ContentScriptState } from '@/entrypoints/content/state'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

/**
 * WXT's shadow-root helper needs a real content-script context and CSS
 * injection, so stand in for it and capture the lifecycle hooks the caller
 * registers.
 */
const shadowRoot = vi.hoisted(() => ({
  createShadowRootUi: vi.fn(),
  /** Hooks from the most recent createShadowRootUi call. */
  options: undefined as
    | {
        name: string
        onMount: (container: HTMLElement) => HTMLElement
        onRemove: (mounted?: HTMLElement) => void
        /** Set by the stub so `remove` can pass it back to `onRemove`. */
        mountedElement?: HTMLElement
      }
    | undefined,
}))
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: shadowRoot.createShadowRootUi,
}))

const bannerReact = vi.hoisted(() => ({
  mountPickerBannerReact: vi.fn(),
}))
vi.mock('@/entrypoints/content/ui/PickerBanner', () => bannerReact)

const contextMenuReact = vi.hoisted(() => ({
  mountPickerContextMenuReact: vi.fn(),
}))
vi.mock('@/entrypoints/content/ui/PickerContextMenu', () => contextMenuReact)

const { mountPickerBanner } = await import('@/entrypoints/content/picker/banner')
const { showPickerContextMenu } = await import('@/entrypoints/content/picker/context-menu')
const { createState } = await import('@/entrypoints/content/state')

const ctx = {} as ContentScriptContext

/** Behave like createShadowRootUi: remember the hooks, return a mountable UI. */
const stubShadowRootUi = () => {
  const mount = vi.fn(() => {
    const container = document.createElement('div')
    document.body.append(container)
    shadowRoot.options!.mountedElement = shadowRoot.options!.onMount(container)
  })
  const remove = vi.fn(() => {
    shadowRoot.options!.onRemove(shadowRoot.options!.mountedElement)
  })
  shadowRoot.createShadowRootUi.mockImplementation(async (_ctx: unknown, options: never) => {
    shadowRoot.options = options
    return { mount, remove }
  })
  return { mount, remove }
}

let state: ContentScriptState

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.style.marginTop = ''
  state = createState()
  shadowRoot.options = undefined
})

describe('mountPickerBanner', () => {
  let onClose: ReturnType<typeof vi.fn<() => void>>
  let setData: ReturnType<typeof vi.fn<(count: number, xpath: string) => void>>
  let unmount: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
    setData = vi.fn<(count: number, xpath: string) => void>()
    unmount = vi.fn<() => void>()
    bannerReact.mountPickerBannerReact.mockReturnValue({
      setData,
      unmount,
      ready: Promise.resolve(),
    })
  })

  it('mounts the React banner inside a shadow root', async () => {
    const { mount } = stubShadowRootUi()

    await mountPickerBanner(ctx, state, onClose)

    expect(shadowRoot.createShadowRootUi).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ name: 'scrape-similar-picker-banner', anchor: 'body' }),
    )
    expect(mount).toHaveBeenCalled()
    expect(bannerReact.mountPickerBannerReact).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ onClose }),
    )
    expect(state.bannerRootEl).not.toBeNull()
    expect(state.bannerSetData).toBe(setData)
  })

  it('reports the current xpath and a zero count to the React banner', async () => {
    stubShadowRootUi()
    state.currentXPath = '//li'

    await mountPickerBanner(ctx, state, onClose)

    const [, props] = bannerReact.mountPickerBannerReact.mock.calls[0]!
    expect(props.getState()).toEqual({ count: 0, xpath: '//li' })
  })

  it('offsets the page once the banner has rendered', async () => {
    stubShadowRootUi()
    state.pickerModeActive = true

    await mountPickerBanner(ctx, state, onClose)

    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('53px')
  })

  it('does not mount a second banner', async () => {
    stubShadowRootUi()
    await mountPickerBanner(ctx, state, onClose)
    shadowRoot.createShadowRootUi.mockClear()

    await mountPickerBanner(ctx, state, onClose)

    expect(shadowRoot.createShadowRootUi).not.toHaveBeenCalled()
  })

  it('waits for React even when it renders asynchronously', async () => {
    stubShadowRootUi()
    let resolveReady: () => void = () => {}
    bannerReact.mountPickerBannerReact.mockReturnValue({
      setData,
      unmount,
      ready: new Promise<void>((resolve) => {
        resolveReady = resolve
      }),
    })

    let settled = false
    const mounting = mountPickerBanner(ctx, state, onClose).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveReady()
    await mounting
    expect(settled).toBe(true)
  })

  it('proceeds when the React banner reports no ready promise', async () => {
    stubShadowRootUi()
    bannerReact.mountPickerBannerReact.mockReturnValue({ setData, unmount })

    await expect(mountPickerBanner(ctx, state, onClose)).resolves.toBeUndefined()
    expect(state.pickerBannerUi).not.toBeNull()
  })

  it('unmounts React and clears the banner state on removal', async () => {
    const { remove } = stubShadowRootUi()
    await mountPickerBanner(ctx, state, onClose)

    remove()

    expect(unmount).toHaveBeenCalled()
    expect(state.bannerRootEl).toBeNull()
    expect(state.bannerSetData).toBeNull()
  })

  it('still clears the banner state when React unmounting throws', async () => {
    const { remove } = stubShadowRootUi()
    unmount.mockImplementation(() => {
      throw new Error('already unmounted')
    })
    await mountPickerBanner(ctx, state, onClose)

    expect(() => remove()).not.toThrow()
    expect(state.bannerRootEl).toBeNull()
  })

  it('tolerates removal before anything was mounted', async () => {
    stubShadowRootUi()
    await mountPickerBanner(ctx, state, onClose)

    expect(() => shadowRoot.options!.onRemove(undefined)).not.toThrow()
    expect(state.bannerRootEl).toBeNull()
  })

  it('logs and gives up when the shadow root cannot be created', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('no document')
    shadowRoot.createShadowRootUi.mockRejectedValue(failure)

    await expect(mountPickerBanner(ctx, state, onClose)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith('Failed to mount picker banner UI', failure)
    expect(state.pickerBannerUi).toBeNull()
  })
})

describe('showPickerContextMenu', () => {
  let onLevelChange: ReturnType<typeof vi.fn<(level: number, method?: string) => void>>
  let onClose: ReturnType<typeof vi.fn<() => void>>
  let removeCrosshairCursor: ReturnType<typeof vi.fn<() => void>>
  let menuApi: {
    unmount: ReturnType<typeof vi.fn>
    updateLevel: ReturnType<typeof vi.fn>
    updateLevels: ReturnType<typeof vi.fn>
    updatePosition: ReturnType<typeof vi.fn>
  }

  const show = (x = 10, y = 20) =>
    showPickerContextMenu(x, y, ctx, state, onLevelChange, onClose, removeCrosshairCursor)

  beforeEach(() => {
    onLevelChange = vi.fn<(level: number, method?: string) => void>()
    onClose = vi.fn<() => void>()
    removeCrosshairCursor = vi.fn<() => void>()
    menuApi = {
      unmount: vi.fn(),
      updateLevel: vi.fn(),
      updateLevels: vi.fn(),
      updatePosition: vi.fn(),
    }
    contextMenuReact.mountPickerContextMenuReact.mockReturnValue(menuApi)
    state.selectorCandidates = ['//li[1]', '//li', '//ul']
    state.selectedCandidateIndex = 1
  })

  it('mounts the React menu and opens it at the pointer', async () => {
    const { mount } = stubShadowRootUi()

    await show(120, 240)
    // The React component is imported dynamically inside onMount.
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))

    expect(shadowRoot.createShadowRootUi).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ name: 'scrape-similar-context-menu' }),
    )
    expect(mount).toHaveBeenCalled()
    expect(contextMenuReact.mountPickerContextMenuReact).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ x: 120, y: 240, levels: 3, currentLevel: 1, onClose }),
      expect.any(HTMLElement),
    )
    expect(state.pickerContextMenuOpen).toBe(true)
    expect(removeCrosshairCursor).toHaveBeenCalled()
  })

  it('remembers where it was opened', async () => {
    stubShadowRootUi()

    await show(120, 240)

    expect(state.contextMenuX).toBe(120)
    expect(state.contextMenuY).toBe(240)
  })

  it('tracks the open with the number of levels available', async () => {
    stubShadowRootUi()

    await show()

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PICKER_CONTEXT_MENU_OPEN, {
      levels_available: 3,
    })
  })

  it('reports a slider change as such', async () => {
    stubShadowRootUi()
    await show()
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))

    const [, props] = contextMenuReact.mountPickerContextMenuReact.mock.calls[0]!
    props.onChange(2)

    expect(onLevelChange).toHaveBeenCalledWith(2, 'slider')
  })

  it('locks page scrolling while the menu is open', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener')
    stubShadowRootUi()

    await show()

    expect(addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), {
      passive: false,
    })
    expect(state.pickerScrollAccumulator).toBe(0)
  })

  it('repositions an already-open menu instead of remounting it', async () => {
    stubShadowRootUi()
    await show(10, 20)
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))
    shadowRoot.createShadowRootUi.mockClear()
    trackEvent.mockClear()

    await show(90, 180)

    expect(shadowRoot.createShadowRootUi).not.toHaveBeenCalled()
    expect(menuApi.updatePosition).toHaveBeenCalledWith(90, 180)
    expect(menuApi.updateLevels).toHaveBeenCalledWith(3, 1)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('reuses the wheel handler across reopens', async () => {
    stubShadowRootUi()
    await show()
    const firstHandler = state.contextMenuWheelHandler

    await show()

    expect(state.contextMenuWheelHandler).toBe(firstHandler)
  })

  it('unmounts React and clears the menu state on removal', async () => {
    const { remove } = stubShadowRootUi()
    await show()
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))

    remove()

    expect(menuApi.unmount).toHaveBeenCalled()
    expect(state.pickerContextMenuHost).toBeNull()
    expect(state.pickerContextMenuApi).toBeNull()
  })

  it('still clears the menu state when React unmounting throws', async () => {
    const { remove } = stubShadowRootUi()
    menuApi.unmount.mockImplementation(() => {
      throw new Error('already unmounted')
    })
    await show()
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))

    expect(() => remove()).not.toThrow()
    expect(state.pickerContextMenuHost).toBeNull()
  })

  it('tolerates removal before anything was mounted', async () => {
    stubShadowRootUi()
    await show()

    expect(() => shadowRoot.options!.onRemove(undefined)).not.toThrow()
    expect(state.pickerContextMenuApi).toBeNull()
  })

  it('tears itself down when the shadow root cannot be created', async () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const failure = new Error('no document')
    shadowRoot.createShadowRootUi.mockRejectedValue(failure)

    await show()

    expect(warnSpy).toHaveBeenCalledWith('Failed to mount picker context menu', failure)
    expect(state.pickerContextMenuOpen).toBe(false)
    expect(state.pickerContextMenuUi).toBeNull()
  })

  it('leaves the crosshair off when the mount fails during picker mode', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {})
    shadowRoot.createShadowRootUi.mockRejectedValue(new Error('no document'))
    // The teardown restores the crosshair when picker mode is still on, and the
    // failure path deliberately passes a no-op for that.
    state.pickerModeActive = true

    await show()

    expect(document.documentElement.style.cursor).toBe('')
  })

  it('changes level when the page is scrolled over the open menu', async () => {
    stubShadowRootUi()
    await show()
    await vi.waitFor(() => expect(state.pickerContextMenuApi).toBe(menuApi))

    document.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 1000, bubbles: true, cancelable: true }),
    )

    expect(onLevelChange).toHaveBeenCalledWith(0, 'scroll')
    expect(menuApi.updateLevel).toHaveBeenCalledWith(0)
  })
})
