// @vitest-environment jsdom
import { mountPickerBannerReact, PickerBanner } from '@/entrypoints/content/ui/PickerBanner'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

let view: RenderResult | undefined

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('PickerBanner', () => {
  it('shows the match count', async () => {
    view = await renderComponent(<PickerBanner count={12} xpath="//li" onClose={() => {}} />)

    expect(view.container.textContent).toContain('12')
  })

  it('shows the current selector in a read-only field', async () => {
    view = await renderComponent(<PickerBanner count={1} xpath="//li" onClose={() => {}} />)

    const input = querySelector<HTMLInputElement>(view.container, 'input')
    expect(input.value).toBe('//li')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(true)
  })

  it('prompts the user when no element is hovered', async () => {
    view = await renderComponent(<PickerBanner count={0} xpath="" onClose={() => {}} />)

    expect(querySelector<HTMLInputElement>(view.container, 'input').placeholder).toBe(
      'Hover over the page to select elements',
    )
  })

  it('closes the picker when the close button is pressed', async () => {
    const onClose = vi.fn()
    view = await renderComponent(<PickerBanner count={1} xpath="//li" onClose={onClose} />)

    await view.act(() => {
      querySelector<HTMLButtonElement>(view!.container, 'button[aria-label="Close picker"]').click()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('mountPickerBannerReact', () => {
  let container: HTMLElement
  let mounted: ReturnType<typeof mountPickerBannerReact> | undefined

  const mount = async (
    handlers: Parameters<typeof mountPickerBannerReact>[1],
    themeRoot?: Element,
  ) => {
    await act(async () => {
      mounted = mountPickerBannerReact(container, handlers, themeRoot)
    })
    await mounted!.ready
    return mounted!
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(async () => {
    if (mounted) await act(async () => mounted!.unmount())
    mounted = undefined
    container.remove()
  })

  it('renders the banner seeded from the current state', async () => {
    await mount({ getState: () => ({ count: 4, xpath: '//tr' }), onClose: () => {} })

    expect(querySelector<HTMLInputElement>(container, 'input').value).toBe('//tr')
    expect(container.textContent).toContain('4')
  })

  it('resolves ready once the banner has rendered', async () => {
    const api = await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} })

    await expect(api.ready).resolves.toBeUndefined()
  })

  it('updates the count and selector through setData', async () => {
    const api = await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} })

    await act(async () => {
      api.setData(9, '//td')
    })

    expect(querySelector<HTMLInputElement>(container, 'input').value).toBe('//td')
    expect(container.textContent).toContain('9')
  })

  it('ignores setData before the first render has committed', async () => {
    // React commits asynchronously, so the setter is not installed yet.
    const api = mountPickerBannerReact(container, {
      getState: () => ({ count: 0, xpath: '' }),
      onClose: () => {},
    })

    expect(() => api.setData(3, '//x')).not.toThrow()

    await act(async () => {})
    mounted = api
    expect(querySelector<HTMLInputElement>(container, 'input').value).toBe('')
  })

  it('ignores setData after unmounting', async () => {
    const api = await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} })
    await act(async () => api.unmount())
    mounted = undefined

    expect(() => api.setData(1, '//x')).not.toThrow()
  })

  it('forwards the close handler to the button', async () => {
    const onClose = vi.fn()
    await mount({ getState: () => ({ count: 0, xpath: '' }), onClose })

    await act(async () => {
      querySelector<HTMLButtonElement>(container, 'button[aria-label="Close picker"]').click()
    })

    expect(onClose).toHaveBeenCalled()
  })

  it('themes the container by default', async () => {
    await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} })

    expect(container.classList.contains('light')).toBe(true)
  })

  it('themes an explicit root element when given one', async () => {
    const themeRoot = document.createElement('div')
    document.body.append(themeRoot)

    await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} }, themeRoot)

    expect(themeRoot.classList.contains('light')).toBe(true)
    expect(container.classList.contains('light')).toBe(false)
  })

  it('detaches the tree on unmount', async () => {
    const api = await mount({ getState: () => ({ count: 0, xpath: '' }), onClose: () => {} })

    await act(async () => api.unmount())
    mounted = undefined

    expect(container.textContent).toBe('')
  })
})
