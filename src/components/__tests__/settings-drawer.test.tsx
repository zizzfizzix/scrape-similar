// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { SettingsDrawer } from '@/components/settings-drawer'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { userPresetsStorage } from '@/utils/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { openRadixTrigger, renderComponent, type RenderResult } from '@@/tests/support/react'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

let view: RenderResult | undefined

const render = () =>
  renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <SettingsDrawer />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

/** The drawer content is portalled, so look for the title in the document. */
const drawerTitle = () =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="drawer-title"]')].find(
    (candidate) => candidate.textContent === 'Settings',
  )

const openDrawer = async () => {
  const trigger = view!.container.querySelector<HTMLElement>('button[aria-label="Settings"]')!
  await view!.act(() => openRadixTrigger(trigger))
}

beforeEach(async () => {
  fakeBrowser.reset()
  await userPresetsStorage.setValue([])
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('SettingsDrawer', () => {
  it('keeps the settings out of the document until the drawer is opened', async () => {
    view = await render()

    expect(drawerTitle()).toBeUndefined()
    expect(trackEvent).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.SETTINGS_OPEN)
  })

  it('reports the drawer being opened', async () => {
    view = await render()

    await openDrawer()

    expect(drawerTitle()).toBeDefined()
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SETTINGS_OPEN)
  })

  it('unlocks the hidden debug row from five clicks on the drawer title', async () => {
    view = await render()
    await openDrawer()

    const title = drawerTitle()!
    expect(document.body.textContent).not.toContain('Debug mode')

    for (let i = 0; i < 5; i++) {
      await view.act(() => title.click())
    }

    expect(document.body.textContent).toContain('Debug mode')
  })
})
