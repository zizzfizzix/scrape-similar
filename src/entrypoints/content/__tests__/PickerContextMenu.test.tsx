// @vitest-environment jsdom
import {
  mountPickerContextMenuReact,
  PickerContextMenu,
} from '@/entrypoints/content/ui/PickerContextMenu'
import {
  type RenderResult,
  act,
  fireEvent,
  render as renderComponent,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

/** Menu geometry the component clamps against. */
const MENU_WIDTH = 80
const MENU_HEIGHT = 208
const PADDING = 8

let view: RenderResult

/** Report a fixed viewport size, which jsdom otherwise fixes at 1024x768. */
const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

beforeEach(() => {
  fakeBrowser.reset()
  setViewport(1000, 800)
})

describe('PickerContextMenu', () => {
  const menu = (container: HTMLElement) => container.querySelector('div[style]')!
  const slider = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('input[type="range"]')!

  const render = (props: Partial<Parameters<typeof PickerContextMenu>[0]> = {}) =>
    renderComponent(
      <PickerContextMenu
        x={100}
        y={200}
        levels={3}
        currentLevel={1}
        onChange={() => {}}
        {...props}
      />,
    )

  it('positions itself at the pointer', async () => {
    view = render()

    expect((menu(view.container) as HTMLElement).style.left).toBe('100px')
    expect((menu(view.container) as HTMLElement).style.top).toBe('200px')
  })

  it('keeps itself inside the right edge', async () => {
    view = render({ x: 995 })

    expect((menu(view.container) as HTMLElement).style.left).toBe(
      `${1000 - MENU_WIDTH - PADDING}px`,
    )
  })

  it('keeps itself inside the bottom edge', async () => {
    view = render({ y: 795 })

    expect((menu(view.container) as HTMLElement).style.top).toBe(`${800 - MENU_HEIGHT - PADDING}px`)
  })

  it('keeps itself inside the top-left corner', async () => {
    view = render({ x: -50, y: -50 })

    expect((menu(view.container) as HTMLElement).style.left).toBe(`${PADDING}px`)
    expect((menu(view.container) as HTMLElement).style.top).toBe(`${PADDING}px`)
  })

  it('spans the slider across every level', async () => {
    view = render({ levels: 4, currentLevel: 2 })

    const input = slider(view.container)
    expect(input.min).toBe('0')
    expect(input.max).toBe('3')
    expect(input.value).toBe('2')
  })

  it('counts levels from the specific end', async () => {
    view = render({ levels: 3, currentLevel: 1 })

    expect(view.container.textContent).toContain('Level 2 of 3')
  })

  it('labels the two ends of the slider', async () => {
    view = render()

    expect(view.container.textContent).toContain('Broad')
    expect(view.container.textContent).toContain('Specific')
  })

  it('collapses the slider when there is a single level', async () => {
    view = render({ levels: 1, currentLevel: 0 })

    expect(slider(view.container).max).toBe('0')
    expect(view.container.textContent).toContain('Level 1 of 1')
  })

  it('collapses the slider when there are no levels at all', async () => {
    view = render({ levels: 0, currentLevel: 0 })

    expect(slider(view.container).max).toBe('0')
  })

  it('reports the level the user dragged to', async () => {
    const onChange = vi.fn()
    view = render({ onChange })
    const input = slider(view.container)

    fireEvent.change(input, { target: { value: '2' } })

    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('suppresses the native context menu over itself', async () => {
    view = render()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })

    await act(() => {
      menu(view.container).dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
  })
})

describe('mountPickerContextMenuReact', () => {
  let container: HTMLElement
  let mounted: ReturnType<typeof mountPickerContextMenuReact> | undefined
  let onChange: ReturnType<typeof vi.fn<(level: number) => void>>
  let onClose: ReturnType<typeof vi.fn<() => void>>

  const mount = async (
    overrides: Partial<Parameters<typeof mountPickerContextMenuReact>[1]> = {},
    themeRoot?: Element,
  ) => {
    await act(async () => {
      mounted = mountPickerContextMenuReact(
        container,
        { x: 100, y: 200, levels: 3, currentLevel: 1, onChange, onClose, ...overrides },
        themeRoot,
      )
    })
    return mounted!
  }

  const menuStyle = () => (container.querySelector('div[style]') as HTMLElement).style
  const slider = () => container.querySelector<HTMLInputElement>('input[type="range"]')!

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    onChange = vi.fn<(level: number) => void>()
    onClose = vi.fn<() => void>()
  })

  afterEach(async () => {
    if (mounted) await act(async () => mounted!.unmount())
    mounted = undefined
    container.remove()
  })

  it('renders the menu with the options it was given', async () => {
    await mount()

    expect(menuStyle().left).toBe('100px')
    expect(slider().value).toBe('1')
    expect(container.textContent).toContain('Level 2 of 3')
  })

  it('moves the menu through updatePosition', async () => {
    const api = await mount()

    await act(async () => api.updatePosition(300, 400))

    expect(menuStyle().left).toBe('300px')
    expect(menuStyle().top).toBe('400px')
  })

  it('changes the highlighted level through updateLevel', async () => {
    const api = await mount()

    await act(async () => api.updateLevel(2))

    expect(slider().value).toBe('2')
  })

  it('replaces the whole range through updateLevels', async () => {
    const api = await mount()

    await act(async () => api.updateLevels(5, 4))

    expect(slider().max).toBe('4')
    expect(slider().value).toBe('4')
  })

  it('reports and reflects a level the user drags to', async () => {
    await mount()
    const input = slider()

    await act(async () => fireEvent.change(input, { target: { value: '0' } }))

    expect(onChange).toHaveBeenCalledWith(0)
    expect(slider().value).toBe('0')
  })

  it('ignores updates issued after unmounting', async () => {
    const api = await mount()

    await act(async () => api.unmount())
    mounted = undefined

    expect(() => api.updateLevel(2)).not.toThrow()
    expect(container.textContent).toBe('')
  })

  it('themes the container by default', async () => {
    await mount()

    expect(container).toHaveClass('light')
  })

  it('themes an explicit root element when given one', async () => {
    const themeRoot = document.createElement('div')
    document.body.append(themeRoot)

    await mount({}, themeRoot)

    expect(themeRoot).toHaveClass('light')
    expect(container).not.toHaveClass('light')
  })
})
