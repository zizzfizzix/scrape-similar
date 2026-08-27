// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { Footer } from '@/components/footer'
import { Logo } from '@/components/Logo'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { author } from '@@/package.json' with { type: 'json' }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

let view: RenderResult | undefined

const render = (props: Parameters<typeof Footer>[0] = {}) =>
  renderComponent(
    <ConsentProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Footer {...props} />
        </TooltipProvider>
      </ThemeProvider>
    </ConsentProvider>,
  )

const links = () => [...view!.container.querySelectorAll('a')]
const authorLink = () => links()[0]!
const supportLink = () => links()[1]!

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('Footer', () => {
  it('credits the author', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Made by')
    expect(authorLink().textContent).toBe(author)
  })

  it('opens the author link in a new tab', async () => {
    view = await render()

    expect(authorLink().href).toContain('linkedin.com/in/kubaserafinowski')
    expect(authorLink().target).toBe('_blank')
    expect(authorLink().rel).toBe('noopener')
  })

  it('tags the author link with the extension as its source', async () => {
    view = await render()

    expect(authorLink().href).toContain('utm_source=scrape-similar-extension')
  })

  it('records a click on the author link', async () => {
    view = await render()

    await view.act(() => authorLink().click())

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTHOR_LINK_PRESS, {
      url: authorLink().href,
    })
  })

  it('offers a support link', async () => {
    view = await render()

    expect(supportLink().href).toContain('ko-fi.com/kubaserafinowski')
    expect(supportLink().getAttribute('aria-label')).toBe('Support Kuba Serafinowski on Ko-fi')
  })

  it('records a click on the support link', async () => {
    view = await render()

    await view.act(() => supportLink().click())

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SUPPORT_ICON_PRESS, {
      url: supportLink().href,
    })
  })

  it('offers a feedback button', async () => {
    view = await render()

    expect(querySelector(view.container, '#feedback-button')).toBeTruthy()
  })

  it('applies an extra class', async () => {
    view = await render({ className: 'my-footer' })

    expect(querySelector(view.container, 'footer').className).toContain('my-footer')
  })

  it('centres its content when there are no settings', async () => {
    view = await render()

    expect(querySelector(view.container, 'footer').className).toContain('justify-center')
    expect(view.container.querySelector('button[aria-label="Settings"]')).toBeNull()
  })

  it('adds the settings drawer when asked', async () => {
    view = await render({ showSettings: true })

    expect(querySelector(view.container, 'footer').className).toContain('justify-between')
    expect(querySelector(view.container, 'button[aria-label="Settings"]')).toBeTruthy()
  })

  it('marks the settings variant with a slot for styling hooks', async () => {
    view = await render({ showSettings: true })

    expect(querySelector(view.container, 'footer').getAttribute('data-slot')).toBe('footer')
  })
})

describe('Logo', () => {
  it('renders a light and a dark variant', async () => {
    view = await renderComponent(<Logo />)

    const images = [...view.container.querySelectorAll('img')]
    expect(images).toHaveLength(2)
    expect(images[0]!.className).toContain('dark:hidden')
    expect(images[1]!.className).toContain('hidden dark:block')
  })

  it('labels both variants for screen readers', async () => {
    view = await renderComponent(<Logo />)

    for (const image of view.container.querySelectorAll('img')) {
      expect(image.alt).toBe('Scrape Similar')
    }
  })

  it('sizes itself with a default class', async () => {
    view = await renderComponent(<Logo />)

    expect(querySelector(view.container, 'img').className).toContain('w-5 h-5')
  })

  it('accepts a size override', async () => {
    view = await renderComponent(<Logo className="size-10" />)

    for (const image of view.container.querySelectorAll('img')) {
      expect(image.className).toContain('size-10')
    }
  })

  it('resolves both icons through the extension URL', async () => {
    view = await renderComponent(<Logo />)

    const images = [...view.container.querySelectorAll('img')]
    expect(images[0]!.src).toContain('/icons/logo-light.svg')
    expect(images[1]!.src).toContain('/icons/logo-dark.svg')
  })
})
