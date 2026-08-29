// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { Footer } from '@/components/footer'
import { Logo } from '@/components/Logo'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { author } from '@@/package.json' with { type: 'json' }
import { type RenderResult, render as renderComponent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

let view: RenderResult

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

const links = () => [...view.container.querySelectorAll('a')]
const authorLink = () => links()[0]!
const supportLink = () => links()[1]!

beforeEach(() => {
  fakeBrowser.reset()
})

describe('Footer', () => {
  it('credits the author', async () => {
    view = render()

    expect(view.container.textContent).toContain('Made by')
    expect(authorLink().textContent).toBe(author)
  })

  it('opens the author link in a new tab', async () => {
    view = render()

    expect(authorLink().href).toContain('linkedin.com/in/kubaserafinowski')
    expect(authorLink().target).toBe('_blank')
    expect(authorLink().rel).toBe('noopener')
  })

  it('tags the author link with the extension as its source', async () => {
    view = render()

    expect(authorLink().href).toContain('utm_source=scrape-similar-extension')
  })

  it('records a click on the author link', async () => {
    view = render()

    await userEvent.click(authorLink())

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTHOR_LINK_PRESS, {
      url: authorLink().href,
    })
  })

  it('offers a support link', async () => {
    view = render()

    expect(supportLink().href).toContain('ko-fi.com/kubaserafinowski')
    expect(supportLink().getAttribute('aria-label')).toBe('Support Kuba Serafinowski on Ko-fi')
  })

  it('records a click on the support link', async () => {
    view = render()

    await userEvent.click(supportLink())

    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SUPPORT_ICON_PRESS, {
      url: supportLink().href,
    })
  })

  it('offers a feedback button', async () => {
    view = render()

    expect(view.container.querySelector('#feedback-button')!).toBeTruthy()
  })

  it('applies an extra class', async () => {
    view = render({ className: 'my-footer' })

    expect(view.container.querySelector('footer')!.className).toContain('my-footer')
  })

  it('centres its content when there are no settings', async () => {
    view = render()

    expect(view.container.querySelector('footer')!.className).toContain('justify-center')
    expect(view.container.querySelector('button[aria-label="Settings"]')).toBeNull()
  })

  it('adds the settings drawer when asked', async () => {
    view = render({ showSettings: true })

    expect(view.container.querySelector('footer')!.className).toContain('justify-between')
    expect(view.container.querySelector('button[aria-label="Settings"]')!).toBeTruthy()
  })

  it('marks the settings variant with a slot for styling hooks', async () => {
    view = render({ showSettings: true })

    expect(view.container.querySelector('footer')!.getAttribute('data-slot')).toBe('footer')
  })
})

describe('Logo', () => {
  it('renders a light and a dark variant', async () => {
    view = renderComponent(<Logo />)

    const images = [...view.container.querySelectorAll('img')]
    expect(images).toHaveLength(2)
    expect(images[0]!.className).toContain('dark:hidden')
    expect(images[1]!.className).toContain('hidden dark:block')
  })

  it('labels both variants for screen readers', async () => {
    view = renderComponent(<Logo />)

    for (const image of view.container.querySelectorAll('img')) {
      expect(image.alt).toBe('Scrape Similar')
    }
  })

  it('sizes itself with a default class', async () => {
    view = renderComponent(<Logo />)

    expect(view.container.querySelector('img')!.className).toContain('w-5 h-5')
  })

  it('accepts a size override', async () => {
    view = renderComponent(<Logo className="size-10" />)

    for (const image of view.container.querySelectorAll('img')) {
      expect(image.className).toContain('size-10')
    }
  })

  it('resolves both icons through the extension URL', async () => {
    view = renderComponent(<Logo />)

    const images = [...view.container.querySelectorAll('img')]
    expect(images[0]!.src).toContain('/icons/logo-light.svg')
    expect(images[1]!.src).toContain('/icons/logo-dark.svg')
  })
})
