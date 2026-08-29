// @vitest-environment jsdom
import { ModeToggle } from '@/components/mode-toggle'
import { ThemeProvider } from '@/components/theme-provider'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { render as renderComponent, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

let view: RenderResult

const render = (props: Parameters<typeof ModeToggle>[0] = {}) =>
  renderComponent(
    <ThemeProvider>
      <ModeToggle {...props} />
    </ThemeProvider>,
  )

const trigger = () => view.container.querySelector<HTMLButtonElement>('button')!

const openMenu = () => userEvent.click(trigger())

const menuItem = (label: string) => screen.getByRole('menuitem', { name: label })

const choose = async (label: string) => {
  await openMenu()
  await userEvent.click(menuItem(label))
}

beforeEach(() => {
  fakeBrowser.reset()
  document.documentElement.className = ''
})

describe('ModeToggle', () => {
  it('shows the system theme by default', async () => {
    view = render()

    expect(trigger().textContent).toContain('System')
  })

  it('shows the light theme when it is selected', async () => {
    await storage.setItem('local:theme', 'light')

    view = render()

    expect(await screen.findByText('Light')).toBeInTheDocument()
  })

  it('shows the dark theme when it is selected', async () => {
    await storage.setItem('local:theme', 'dark')

    view = render()

    expect(await screen.findByText('Dark')).toBeInTheDocument()
  })

  it('forwards the id and label reference to the button', async () => {
    view = render({ id: 'theme-toggle', ariaLabelledby: 'theme-label' })

    expect(trigger().id).toBe('theme-toggle')
    expect(trigger().getAttribute('aria-labelledby')).toBe('theme-label')
  })

  it('offers all three themes', async () => {
    view = render()

    await openMenu()

    expect(menuItem('Light')).toBeTruthy()
    expect(menuItem('Dark')).toBeTruthy()
    expect(menuItem('System')).toBeTruthy()
  })

  it('switches to light and records the change', async () => {
    view = render()

    await choose('Light')

    expect(await storage.getItem('local:theme')).toBe('light')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'system',
      to_theme: 'light',
    })
  })

  it('switches to dark and records the change', async () => {
    view = render()

    await choose('Dark')

    expect(await storage.getItem('local:theme')).toBe('dark')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'system',
      to_theme: 'dark',
    })
  })

  it('switches back to following the system and records the change', async () => {
    await storage.setItem('local:theme', 'dark')
    view = render()

    await choose('System')

    expect(await storage.getItem('local:theme')).toBe('system')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.THEME_CHANGE, {
      from_theme: 'dark',
      to_theme: 'system',
    })
  })

  it('does not record picking the theme that is already active', async () => {
    await storage.setItem('local:theme', 'dark')
    view = render()

    await choose('Dark')

    expect(trackEvent).not.toHaveBeenCalled()
  })
})
