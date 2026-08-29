// @vitest-environment jsdom
import {
  adjustFixedElementsForBanner,
  getPickerBannerElement,
  getPickerBannerHeight,
  restoreFixedElements,
  unmountPickerBanner,
  updateBodyMarginForBanner,
  updatePickerBannerContent,
} from '@/entrypoints/content/picker/banner'
import { createState, type ContentScriptState } from '@/entrypoints/content/state'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Give an element a fixed height, which jsdom does not compute on its own. */
const withHeight = (element: HTMLElement, height: number) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect)
  return element
}

/** A host element with a shadow root containing the banner's `.fixed` wrapper. */
const createBannerHost = (height?: number) => {
  const host = document.createElement('div')
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const fixed = document.createElement('div')
  fixed.className = 'fixed'
  shadow.append(fixed)
  if (height !== undefined) withHeight(fixed, height)
  return { host: host as HTMLDivElement, fixed }
}

let state: ContentScriptState

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.style.marginTop = ''
  state = createState()
})

describe('getPickerBannerElement', () => {
  it('returns null before the banner is mounted', () => {
    expect(getPickerBannerElement(state)).toBeNull()
  })

  it('finds the fixed wrapper inside the shadow root', () => {
    const { host, fixed } = createBannerHost()
    state.bannerRootEl = host

    expect(getPickerBannerElement(state)).toBe(fixed)
  })

  it('falls back to the root node when the host has no shadow root', () => {
    const container = document.createElement('div')
    const fixed = document.createElement('div')
    fixed.className = 'fixed'
    container.append(fixed)
    document.body.append(container)
    state.bannerRootEl = container as HTMLDivElement

    // The root node is the document, which does contain the `.fixed` element.
    expect(getPickerBannerElement(state)).toBe(fixed)
  })

  it('returns null when the shadow root holds no fixed wrapper', () => {
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    document.body.append(host)
    state.bannerRootEl = host as HTMLDivElement

    expect(getPickerBannerElement(state)).toBeNull()
  })
})

describe('getPickerBannerHeight', () => {
  it('measures the mounted banner', () => {
    const { host } = createBannerHost(72)
    state.bannerRootEl = host

    expect(getPickerBannerHeight(state)).toBe(72)
  })

  it('falls back to the default height when the banner is not mounted', () => {
    expect(getPickerBannerHeight(state)).toBe(53)
  })

  it('falls back to the default height when the banner measures zero', () => {
    const { host } = createBannerHost(0)
    state.bannerRootEl = host

    expect(getPickerBannerHeight(state)).toBe(53)
  })
})

describe('adjustFixedElementsForBanner', () => {
  /** Render `html` and report the computed style jsdom cannot infer. */
  const withComputedStyle = (styles: Map<HTMLElement, { position: string; top: string }>) => {
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) => {
      const override = styles.get(element as HTMLElement)
      return override ? (override as unknown as CSSStyleDeclaration) : original(element)
    }) as typeof window.getComputedStyle)
  }

  it('skips nodes that are not HTML elements', () => {
    document.body.innerHTML = '<header id="h"></header>'
    const header = document.querySelector<HTMLElement>('#h')!
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.append(svg)
    withComputedStyle(new Map([[header, { position: 'fixed', top: '0px' }]]))

    adjustFixedElementsForBanner(50, state)

    // The SVG is walked past without being measured or moved.
    expect(state.originalFixedElementTops.has(svg as unknown as HTMLElement)).toBe(false)
    expect(header.style.getPropertyValue('top')).toBe('50px')
  })

  it('pushes a fixed header down by the banner height', () => {
    document.body.innerHTML = '<header id="h"></header>'
    const header = document.querySelector<HTMLElement>('#h')!
    withComputedStyle(new Map([[header, { position: 'fixed', top: '0px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(header.style.getPropertyValue('top')).toBe('50px')
    expect(header.style.getPropertyPriority('top')).toBe('important')
    expect(state.originalFixedElementTops.get(header)).toBe('')
  })

  it('preserves an existing offset when pushing down', () => {
    document.body.innerHTML = '<header id="h" style="top: 10px"></header>'
    const header = document.querySelector<HTMLElement>('#h')!
    withComputedStyle(new Map([[header, { position: 'fixed', top: '10px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(header.style.getPropertyValue('top')).toBe('60px')
    expect(state.originalFixedElementTops.get(header)).toBe('10px')
  })

  it('adjusts sticky elements too', () => {
    document.body.innerHTML = '<nav id="n"></nav>'
    const nav = document.querySelector<HTMLElement>('#n')!
    withComputedStyle(new Map([[nav, { position: 'sticky', top: '0px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(nav.style.getPropertyValue('top')).toBe('50px')
  })

  it('leaves statically positioned elements alone', () => {
    document.body.innerHTML = '<div id="d"></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'static', top: '0px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('')
    expect(state.originalFixedElementTops.size).toBe(0)
  })

  it('leaves elements with an auto top alone', () => {
    document.body.innerHTML = '<div id="d"></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'fixed', top: 'auto' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('')
  })

  it('leaves elements already below the banner alone', () => {
    document.body.innerHTML = '<div id="d"></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'fixed', top: '200px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('')
  })

  it('leaves elements above the viewport alone', () => {
    document.body.innerHTML = '<div id="d"></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'fixed', top: '-10px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('')
  })

  it('treats an unparseable top as zero', () => {
    document.body.innerHTML = '<div id="d"></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'fixed', top: 'inherit' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('50px')
  })

  it('skips the extension’s own shadow hosts', () => {
    document.body.innerHTML = '<div data-wxt-shadow-root><div id="d"></div></div>'
    const div = document.querySelector<HTMLElement>('#d')!
    withComputedStyle(new Map([[div, { position: 'fixed', top: '0px' }]]))

    adjustFixedElementsForBanner(50, state)

    expect(div.style.getPropertyValue('top')).toBe('')
  })

  it('does not overwrite a remembered original on a second pass', () => {
    document.body.innerHTML = '<header id="h" style="top: 10px"></header>'
    const header = document.querySelector<HTMLElement>('#h')!
    withComputedStyle(new Map([[header, { position: 'fixed', top: '10px' }]]))

    adjustFixedElementsForBanner(50, state)
    adjustFixedElementsForBanner(50, state)

    expect(state.originalFixedElementTops.get(header)).toBe('10px')
  })
})

describe('restoreFixedElements', () => {
  it('puts back a remembered inline offset', () => {
    const header = document.createElement('header')
    header.style.top = '99px'
    state.originalFixedElementTops.set(header, '10px')

    restoreFixedElements(state)

    expect(header.style.top).toBe('10px')
    expect(state.originalFixedElementTops.size).toBe(0)
  })

  it('removes the offset entirely when there was none', () => {
    const header = document.createElement('header')
    header.style.top = '99px'
    state.originalFixedElementTops.set(header, '')

    restoreFixedElements(state)

    expect(header.style.top).toBe('')
  })
})

describe('updateBodyMarginForBanner', () => {
  it('does nothing while picker mode is off', () => {
    const { host } = createBannerHost(50)
    state.bannerRootEl = host

    updateBodyMarginForBanner(state)

    expect(document.documentElement.style.marginTop).toBe('')
  })

  it('does nothing before the banner is mounted', () => {
    state.pickerModeActive = true

    updateBodyMarginForBanner(state)

    expect(document.documentElement.style.marginTop).toBe('')
  })

  it('offsets the page by the banner height', () => {
    const { host } = createBannerHost(50)
    state.pickerModeActive = true
    state.bannerRootEl = host

    updateBodyMarginForBanner(state)

    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('50px')
    expect(document.documentElement.style.getPropertyPriority('margin-top')).toBe('important')
  })

  it('remembers the original inline margin the first time only', () => {
    const { host } = createBannerHost(50)
    document.documentElement.style.marginTop = '4px'
    state.pickerModeActive = true
    state.bannerRootEl = host

    updateBodyMarginForBanner(state)
    updateBodyMarginForBanner(state)

    expect(state.originalBodyMarginTopInline).toBe('4px')
  })

  it('adds the banner height on top of the page’s own computed margin', () => {
    const { host } = createBannerHost(50)
    state.pickerModeActive = true
    state.bannerRootEl = host
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) =>
      element === document.documentElement
        ? ({ marginTop: '20px' } as CSSStyleDeclaration)
        : original(element)) as typeof window.getComputedStyle)

    updateBodyMarginForBanner(state)

    expect(state.originalBodyMarginTopComputedPx).toBe(20)
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('70px')
  })

  it('treats an unparseable computed margin as zero', () => {
    const { host } = createBannerHost(50)
    state.pickerModeActive = true
    state.bannerRootEl = host
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element) =>
      element === document.documentElement
        ? ({ marginTop: '' } as CSSStyleDeclaration)
        : original(element)) as typeof window.getComputedStyle)

    updateBodyMarginForBanner(state)

    expect(state.originalBodyMarginTopComputedPx).toBe(0)
    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('50px')
  })

  it('reuses a remembered computed margin instead of measuring again', () => {
    const { host } = createBannerHost(50)
    state.pickerModeActive = true
    state.bannerRootEl = host
    state.originalBodyMarginTopComputedPx = 8

    updateBodyMarginForBanner(state)

    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('58px')
  })
})

describe('updatePickerBannerContent', () => {
  it('writes the match count and xpath into the banner elements', () => {
    state.bannerCountEl = document.createElement('span')
    state.bannerXPathEl = document.createElement('input')

    updatePickerBannerContent(7, '//li', state)

    expect(state.bannerCountEl.textContent).toBe('7')
    expect(state.bannerXPathEl.value).toBe('//li')
  })

  it('notifies the React banner when one is mounted', () => {
    const setData = vi.fn()
    state.bannerSetData = setData

    updatePickerBannerContent(7, '//li', state)

    expect(setData).toHaveBeenCalledWith(7, '//li')
  })

  it('does nothing harmful when no banner element exists', () => {
    expect(() => updatePickerBannerContent(7, '//li', state)).not.toThrow()
  })

  it('re-applies the page offset', () => {
    const { host } = createBannerHost(50)
    state.pickerModeActive = true
    state.bannerRootEl = host

    updatePickerBannerContent(7, '//li', state)

    expect(document.documentElement.style.getPropertyValue('margin-top')).toBe('50px')
  })
})

describe('unmountPickerBanner', () => {
  it('removes a mounted banner and forgets it', () => {
    const remove = vi.fn()
    state.pickerBannerUi = { mount: vi.fn(), remove }

    unmountPickerBanner(state)

    expect(remove).toHaveBeenCalled()
    expect(state.pickerBannerUi).toBeNull()
  })

  it('does nothing when no banner is mounted', () => {
    expect(() => unmountPickerBanner(state)).not.toThrow()
    expect(state.pickerBannerUi).toBeNull()
  })

  it('swallows a failure to remove', () => {
    state.pickerBannerUi = {
      mount: vi.fn(),
      remove: vi.fn(() => {
        throw new Error('already detached')
      }),
    }

    expect(() => unmountPickerBanner(state)).not.toThrow()
  })
})
