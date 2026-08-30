// @vitest-environment jsdom
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY, getConsentState } from '@/utils/consent'
import { MESSAGE_TYPES } from '@/utils/types'
import { spyOnBrowser } from '@@/tests/support/fake-browser'
import { type RenderResult, act, render as renderComponent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: toastMocks.toast,
}))

// `isTest` is a build-time constant and decides which demo page is opened.
const modeFlags = { isDev: false, isTest: true, isDevOrTest: true }
vi.mock('@/utils/modeTest', () => ({
  get isDev() {
    return modeFlags.isDev
  },
  get isTest() {
    return modeFlags.isTest
  },
  get isDevOrTest() {
    return modeFlags.isDevOrTest
  },
}))

const { OnboardingApp } = await import('@/entrypoints/onboarding/OnboardingApp')
const { ConsentProvider } = await import('@/components/consent-provider')
const { ThemeProvider } = await import('@/components/theme-provider')
const { TooltipProvider } = await import('@/components/ui/tooltip')

let view: RenderResult
let replace: ReturnType<typeof vi.fn>

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

/** Render, and let mount-time storage reads settle before asserting. */
const render = async () => {
  const rendered = renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <OnboardingApp />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )
  await act(async () => {})
  return rendered
}

const byText = (text: string): HTMLButtonElement => {
  const found = [...view.container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.trim().startsWith(text),
  )
  if (!found) throw new Error(`No button starting with "${text}"`)
  return found
}

const hasButton = (text: string) =>
  [...view.container.querySelectorAll('button')].some((candidate) =>
    candidate.textContent?.trim().startsWith(text),
  )

const press = (text: string) => act(() => byText(text).click())

/** Step forward until the last slide's Start button appears. */
const goToLastSlide = async () => {
  while (!hasButton('Start')) await press('Next')
}

beforeEach(async () => {
  fakeBrowser.reset()
  modeFlags.isTest = true
  await storage.setItem(consentKey, true)
  replace = vi.fn()
  vi.stubGlobal('location', { ...window.location, replace })
  spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({ success: true } as never)
})

afterEach(async () => {
  vi.unstubAllGlobals()
})

describe('OnboardingApp', () => {
  it('welcomes the user', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Welcome to Scrape Similar')
  })

  it('asks for a consent decision first', async () => {
    await storage.removeItem(consentKey)

    view = await render()

    expect(view.container.textContent).toContain('Help improve Scrape Similar')
    expect(hasButton('Next')).toBe(false)
  })

  it('starts the tour once a decision is made', async () => {
    await storage.removeItem(consentKey)
    view = await render()

    await press('Accept')

    expect(await getConsentState()).toBe(true)
    expect(hasButton('Next')).toBe(true)
  })

  it('starts the tour after a refusal too', async () => {
    await storage.removeItem(consentKey)
    view = await render()

    await press('Decline')

    expect(await getConsentState()).toBe(false)
    expect(hasButton('Next')).toBe(true)
  })

  it('renders nothing until the stored decision has loaded', async () => {
    vi.spyOn(storage, 'getItem').mockReturnValue(new Promise(() => {}))

    view = await render()

    expect(view.container.textContent).toBe('')
  })

  it('records each slide as it is reached', async () => {
    view = await render()

    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ONBOARDING_CARD_VIEW,
      expect.objectContaining({ slide_number: 1, is_first_slide: true }),
    )
  })

  it('offers no way back from the first slide', async () => {
    view = await render()

    expect(hasButton('Previous')).toBe(false)
  })

  it('steps forward and records the move', async () => {
    view = await render()

    await press('Next')

    expect(hasButton('Previous')).toBe(true)
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ONBOARDING_NEXT_BUTTON_PRESS,
      expect.objectContaining({ from_slide: expect.objectContaining({ index: 1 }) }),
    )
  })

  it('steps back and records the move', async () => {
    view = await render()
    await press('Next')

    await press('Previous')

    expect(hasButton('Previous')).toBe(false)
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ONBOARDING_PREVIOUS_BUTTON_PRESS,
      expect.objectContaining({ to_slide: expect.objectContaining({ index: 1 }) }),
    )
  })

  it('offers to start the demo on the last slide', async () => {
    view = await render()

    await goToLastSlide()

    expect(hasButton('Next')).toBe(false)
    expect(hasButton('Start')).toBe(true)
  })

  it('records finishing the tour', async () => {
    view = await render()

    await goToLastSlide()

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {
      total_slides_viewed: expect.any(Number),
    })
  })

  it('shows the Mac shortcut on a Mac', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')

    view = await render()
    await goToLastSlide()

    expect(view.container.textContent).toContain('⌘+Shift+X')
  })

  it('shows the Windows shortcut elsewhere', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')

    view = await render()
    await goToLastSlide()

    expect(view.container.textContent).toContain('Ctrl+Shift+X')
  })

  describe('starting the demo', () => {
    it('opens the panel, sets up the scrape and navigates to the article', async () => {
      const sendMessage = spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
        success: true,
      } as never)
      view = await render()
      await goToLastSlide()

      await act(async () => {
        byText('Start').click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(sendMessage).toHaveBeenCalledWith({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })
      expect(sendMessage).toHaveBeenCalledWith({ type: MESSAGE_TYPES.TRIGGER_DEMO_SCRAPE })
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIDE_PANEL_OPEN, {
        trigger: 'onboarding_completion_button_press',
      })
      expect(replace).toHaveBeenCalledWith(
        'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
      )
    })

    it('navigates to a random article in production builds', async () => {
      modeFlags.isTest = false
      view = await render()
      await goToLastSlide()

      await act(async () => {
        byText('Start').click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(replace).toHaveBeenCalledWith('https://en.wikipedia.org/wiki/Special:Random')
    })

    it('reports a demo the background could not set up', async () => {
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
        success: false,
        error: 'No tab ID available from sender',
      } as never)
      view = await render()
      await goToLastSlide()

      await act(async () => {
        byText('Start').click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith(
        'Failed to start demo: No tab ID available from sender',
      )
      expect(replace).not.toHaveBeenCalled()
    })

    it('reports a refusal with no reason', async () => {
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
        success: false,
      } as never)
      view = await render()
      await goToLastSlide()

      await act(async () => {
        byText('Start').click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to start demo: Unknown error')
    })

    it('reports a background it could not reach', async () => {
      spyOnBrowser(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(new Error('port closed'))
      view = await render()
      await goToLastSlide()

      await act(async () => {
        byText('Start').click()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to start demo. Please try again.')
    })
  })
})
