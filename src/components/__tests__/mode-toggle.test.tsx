// @vitest-environment jsdom
import { ModeToggle } from '@/components/mode-toggle'
import { ThemeProvider } from '@/components/theme-provider'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import {
  findByRole,
  openRadixTrigger,
  querySelector,
  renderComponent,
  type RenderResult,
} from '@@/tests/support/react'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

let view: RenderResult | undefined

const render = (props: Parameters<typeof ModeToggle>[0] = {}) =>
  renderComponent(
    <ThemeProvider>
      <ModeToggle {...props} />
    </ThemeProvider>,
  )

const trigger = () => querySelector<HTMLButtonElement>(view!.container, 'button')

const openMenu = () => view!.act(() => openRadixTrigger(trigger()))

const menuItem = (label: string) => findByRole('menuitem', label)

const choose = async (label: string) => {
  await openMenu()
  await view!.act(() => menuItem(label).click())
}

beforeEach(() => {
  fakeBrowser.reset()
  document.documentElement.className = ''
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('ModeToggle', () => {
  it('shows the system theme by default', async () => {
    view = await render()

    expect(trigger().textContent).toContain('System')
  })

  it('shows the light theme when it is selected', async () => {
    await storage.setItem('local:theme', 'light')

    view = await render()

    expect(trigger().textContent).toContain('Light')
  })

  it('shows the dark theme when it is selected', async () => {
    await storage.setItem('local:theme', 'dark')

    view = await render()

    expect(trigger().textContent).toContain('Dark')
  })

  it('forwards the id and label reference to the button', async () => {
    view = await render({ id: 'theme-toggle', ariaLabelledby: 'theme-label' })

    expect(trigger().id).toBe('theme-toggle')
    expect(trigger().getAttribute('aria-labelledby')).toBe('theme-label')
  })

  it('offers all three themes', async () => {
    view = await render()

    await openMenu()

    expect(menuItem('Light')).toBeTruthy()
    expect(menuItem('Dark')).toBeTruthy()
    expect(menuItem('System')).toBeTruthy()
  })

  it('switches to light and records the change', async () => {
    view = await render()

    await choose('Light')

    expect(await storage.getItem('local:theme')).toBe('light')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'system',
      to_theme: 'light',
    })
  })

  it('switches to dark and records the change', async () => {
    view = await render()

    await choose('Dark')

    expect(await storage.getItem('local:theme')).toBe('dark')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'system',
      to_theme: 'dark',
    })
  })

  it('switches back to following the system and records the change', async () => {
    await storage.setItem('local:theme', 'dark')
    view = await render()

    await choose('System')

    expect(await storage.getItem('local:theme')).toBe('system')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'dark',
      to_theme: 'system',
    })
  })

  it('does not record picking the theme that is already active', async () => {
    await storage.setItem('local:theme', 'dark')
    view = await render()

    await choose('Dark')

    expect(trackEvent).not.toHaveBeenCalled()
  })
})
