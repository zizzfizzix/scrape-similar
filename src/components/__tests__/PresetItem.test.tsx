// @vitest-environment jsdom
import PresetItem from '@/components/PresetItem'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import type { Preset } from '@/utils/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

let view: RenderResult | undefined

const userPreset = (overrides: Partial<Preset> = {}): Preset => ({
  id: 'user-1',
  name: 'My links',
  config: { mainSelector: '//a', columns: [{ name: 'URL', selector: '@href' }] },
  createdAt: 1_700_000_000_000,
  ...overrides,
})

const systemPreset = SYSTEM_PRESETS[0]!

type PresetItemProps = Parameters<typeof PresetItem>[0]

const render = (overrides: Partial<PresetItemProps> = {}) => {
  const props: PresetItemProps = {
    preset: userPreset(),
    onSelect: () => {},
    onDelete: () => {},
    ...overrides,
  }
  return renderComponent(
    <TooltipProvider>
      <PresetItem {...props} />
    </TooltipProvider>,
  )
}

const row = () => querySelector(view!.container, ':scope > div')
const nameLabel = () => querySelector(view!.container, 'span.font-medium')
const selectorLabel = () => querySelector(view!.container, 'span.font-mono')
const actionButton = () => querySelector<HTMLButtonElement>(view!.container, 'button')

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('PresetItem', () => {
  it('shows the preset name and selector', async () => {
    view = await render()

    expect(view.container.textContent).toContain('My links')
    expect(view.container.textContent).toContain('//a')
  })

  it('hides the selector when asked', async () => {
    view = await render({ showXPath: false })

    expect(view.container.querySelector('span.font-mono')).toBeNull()
  })

  it('truncates a very long selector', async () => {
    const longSelector = `//${'a'.repeat(200)}`
    view = await render({
      preset: userPreset({ config: { mainSelector: longSelector, columns: [] } }),
    })

    const selectorText = selectorLabel().textContent!
    expect(selectorText).toHaveLength(101)
    expect(selectorText.endsWith('…')).toBe(true)
  })

  it('leaves a selector at the limit intact', async () => {
    const selector = 'a'.repeat(100)
    view = await render({ preset: userPreset({ config: { mainSelector: selector, columns: [] } }) })

    expect(selectorLabel().textContent).toBe(selector)
  })

  it('selects the preset when the row is clicked', async () => {
    const onSelect = vi.fn()
    const preset = userPreset()
    view = await render({ preset, onSelect })

    await view.act(() => row().click())

    expect(onSelect).toHaveBeenCalledWith(preset)
  })

  it('deletes without also selecting when the action is clicked', async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    const preset = userPreset()
    view = await render({ preset, onSelect, onDelete })

    await view.act(() => actionButton().click())

    expect(onDelete).toHaveBeenCalledWith(preset)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('offers to delete a user preset', async () => {
    view = await render()

    expect(actionButton().getAttribute('aria-label')).toBe('Delete preset "My links"')
  })

  it('offers to hide a system preset rather than delete it', async () => {
    view = await render({ preset: systemPreset })

    expect(actionButton().getAttribute('aria-label')).toBe(`Hide preset "${systemPreset.name}"`)
  })

  it('badges a system preset', async () => {
    view = await render({ preset: systemPreset })

    expect(view.container.textContent).toContain('System')
  })

  it('does not badge a user preset', async () => {
    view = await render()

    expect(view.container.textContent).not.toContain('System')
  })

  it('redacts a user preset’s name and selector from analytics', async () => {
    view = await render()

    expect(nameLabel().className).toContain('ph_hidden')
    expect(selectorLabel().className).toContain('ph_hidden')
  })

  it('leaves a system preset’s name visible to analytics', async () => {
    view = await render({ preset: systemPreset })

    expect(nameLabel().className).not.toContain('ph_hidden')
  })

  it('marks the selected preset', async () => {
    view = await render({ isSelected: true })

    expect(view.container.querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('leaves an unselected preset unmarked', async () => {
    view = await render()

    expect(view.container.querySelector('svg.lucide-check')).toBeNull()
  })

  it('applies an extra class', async () => {
    view = await render({ className: 'highlighted' })

    expect(row().className).toContain('highlighted')
  })

  it('exposes its position for keyboard navigation when given one', async () => {
    view = await render({ 'data-index': 3 })

    expect(row().getAttribute('data-autosuggest-index')).toBe('3')
  })

  it('omits the position attribute when no index is given', async () => {
    view = await render()

    expect(row().hasAttribute('data-autosuggest-index')).toBe(false)
  })

  it('keeps a zero index, which is falsy but meaningful', async () => {
    view = await render({ 'data-index': 0 })

    expect(row().getAttribute('data-autosuggest-index')).toBe('0')
  })
})
