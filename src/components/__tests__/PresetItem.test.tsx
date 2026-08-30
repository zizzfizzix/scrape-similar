// @vitest-environment jsdom
import { PresetItem } from '@/components/PresetItem'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import type { Preset } from '@/utils/types'
import { render as renderComponent, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

let view: RenderResult

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

const row = () => view.container.querySelector<HTMLElement>(':scope > div')!
const nameLabel = () => view.container.querySelector<HTMLElement>('span.font-medium')!
const selectorLabel = () => view.container.querySelector<HTMLElement>('span.font-mono')!
const actionButton = () => view.container.querySelector<HTMLButtonElement>('button')!

describe('PresetItem', () => {
  it('shows the preset name and selector', async () => {
    view = render()

    expect(view.container.textContent).toContain('My links')
    expect(view.container.textContent).toContain('//a')
  })

  it('hides the selector when asked', async () => {
    view = render({ showXPath: false })

    expect(view.container.querySelector('span.font-mono')).toBeNull()
  })

  it('truncates a very long selector', async () => {
    const longSelector = `//${'a'.repeat(200)}`
    view = render({
      preset: userPreset({ config: { mainSelector: longSelector, columns: [] } }),
    })

    const selectorText = selectorLabel().textContent!
    expect(selectorText).toHaveLength(101)
    expect(selectorText.endsWith('…')).toBe(true)
  })

  it('leaves a selector at the limit intact', async () => {
    const selector = 'a'.repeat(100)
    view = render({ preset: userPreset({ config: { mainSelector: selector, columns: [] } }) })

    expect(selectorLabel().textContent).toBe(selector)
  })

  it('selects the preset when the row is clicked', async () => {
    const onSelect = vi.fn()
    const preset = userPreset()
    view = render({ preset, onSelect })

    await userEvent.click(row())

    expect(onSelect).toHaveBeenCalledWith(preset)
  })

  it('deletes without also selecting when the action is clicked', async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    const preset = userPreset()
    view = render({ preset, onSelect, onDelete })

    await userEvent.click(actionButton())

    expect(onDelete).toHaveBeenCalledWith(preset)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('offers to delete a user preset', async () => {
    view = render()

    expect(actionButton()).toHaveAttribute('aria-label', 'Delete preset "My links"')
  })

  it('offers to hide a system preset rather than delete it', async () => {
    view = render({ preset: systemPreset })

    expect(actionButton()).toHaveAttribute('aria-label', `Hide preset "${systemPreset.name}"`)
  })

  it('badges a system preset', async () => {
    view = render({ preset: systemPreset })

    expect(view.container.textContent).toContain('System')
  })

  it('does not badge a user preset', async () => {
    view = render()

    expect(view.container.textContent).not.toContain('System')
  })

  it('redacts a user preset’s name and selector from analytics', async () => {
    view = render()

    expect(nameLabel().className).toContain('ph_hidden')
    expect(selectorLabel().className).toContain('ph_hidden')
  })

  it('leaves a system preset’s name visible to analytics', async () => {
    view = render({ preset: systemPreset })

    expect(nameLabel().className).not.toContain('ph_hidden')
  })

  it('marks the selected preset', async () => {
    view = render({ isSelected: true })

    expect(view.container.querySelector('svg.lucide-check')).not.toBeNull()
  })

  it('leaves an unselected preset unmarked', async () => {
    view = render()

    expect(view.container.querySelector('svg.lucide-check')).toBeNull()
  })

  it('applies an extra class', async () => {
    view = render({ className: 'highlighted' })

    expect(row().className).toContain('highlighted')
  })

  it('exposes its position for keyboard navigation when given one', async () => {
    view = render({ 'data-index': 3 })

    expect(row()).toHaveAttribute('data-autosuggest-index', '3')
  })

  it('omits the position attribute when no index is given', async () => {
    view = render()

    expect(row()).not.toHaveAttribute('data-autosuggest-index')
  })

  it('keeps a zero index, which is falsy but meaningful', async () => {
    view = render({ 'data-index': 0 })

    expect(row()).toHaveAttribute('data-autosuggest-index', '0')
  })
})
