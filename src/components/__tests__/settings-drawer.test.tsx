// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { SettingsDrawer } from '@/components/settings-drawer'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { userPresetsStorage } from '@/utils/storage'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const renderDrawer = () =>
  render(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <SettingsDrawer />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

const openDrawer = () => userEvent.click(screen.getByRole('button', { name: 'Settings' }))

beforeEach(async () => {
  fakeBrowser.reset()
  await userPresetsStorage.setValue([])
})

describe('SettingsDrawer', () => {
  it('keeps the settings out of the document until the drawer is opened', async () => {
    renderDrawer()

    expect(screen.queryByText('Theme')).not.toBeInTheDocument()
    expect(trackEvent).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.SETTINGS_OPEN)
  })

  it('reports the drawer being opened', async () => {
    renderDrawer()

    await openDrawer()

    expect(await screen.findByText('Theme')).toBeInTheDocument()
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SETTINGS_OPEN)
  })

  it('unlocks the hidden debug row from five clicks on the drawer title', async () => {
    renderDrawer()
    await openDrawer()

    const title = await screen.findByText('Settings', { selector: '[data-slot="drawer-title"]' })
    expect(screen.queryByText('Debug mode')).not.toBeInTheDocument()

    for (let i = 0; i < 5; i++) await userEvent.click(title)

    expect(await screen.findByText('Debug mode')).toBeInTheDocument()
  })
})
