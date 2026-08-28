// @vitest-environment jsdom
import { ConsentCard } from '@/components/ConsentCard'
import { ConsentContent } from '@/components/ConsentContent'
import { ConsentModal } from '@/components/ConsentModal'
import { ConsentProvider, useConsent } from '@/components/consent-provider'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { ANALYTICS_CONSENT_STORAGE_KEY, getConsentState } from '@/utils/consent'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

let view: RenderResult | undefined

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

const withProvider = (children: ReactNode) => <ConsentProvider>{children}</ConsentProvider>

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
})

describe('ConsentProvider', () => {
  /** Render the current context value into the DOM as JSON. */
  const Probe = () => {
    const consent = useConsent()
    return (
      <button data-testid="probe" onClick={() => void consent.setConsent(true)}>
        {JSON.stringify({ loading: consent.loading, state: consent.state })}
      </button>
    )
  }

  const probeText = () => querySelector(view!.container, '[data-testid="probe"]').textContent

  it('reports the stored decision once loaded', async () => {
    await storage.setItem(consentKey, true)

    view = await renderComponent(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('reports an undecided state when nothing is stored', async () => {
    view = await renderComponent(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('reports a declined decision', async () => {
    await storage.setItem(consentKey, false)

    view = await renderComponent(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: false }))
  })

  it('treats an unreadable store as undecided', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'))

    view = await renderComponent(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('persists a decision made through the context', async () => {
    view = await renderComponent(withProvider(<Probe />))

    await view.act(() => {
      querySelector<HTMLButtonElement>(view!.container, '[data-testid="probe"]').click()
    })

    expect(await getConsentState()).toBe(true)
    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('picks up a decision made elsewhere', async () => {
    view = await renderComponent(withProvider(<Probe />))

    await view.act(async () => {
      await storage.setItem(consentKey, true)
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('returns to undecided when the decision is cleared elsewhere', async () => {
    await storage.setItem(consentKey, true)
    view = await renderComponent(withProvider(<Probe />))

    await view.act(async () => {
      await storage.removeItem(consentKey)
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('treats a blank stored value as undecided', async () => {
    await storage.setItem(consentKey, true)
    view = await renderComponent(withProvider(<Probe />))

    await view.act(async () => {
      await storage.setItem(consentKey, '')
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('stops listening once unmounted', async () => {
    view = await renderComponent(withProvider(<Probe />))
    const { cleanup } = view
    view = undefined

    await cleanup()

    await expect(storage.setItem(consentKey, true)).resolves.toBeUndefined()
  })
})

describe('useConsent', () => {
  it('refuses to run outside a provider', async () => {
    const Orphan = () => {
      useConsent()
      return null
    }
    // React logs the thrown error through its own error reporting.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(renderComponent(<Orphan />)).rejects.toThrow(
      'useConsent must be used within <ConsentProvider>',
    )

    errorSpy.mockRestore()
  })
})

describe('ConsentCard', () => {
  const decline = () => querySelector<HTMLButtonElement>(view!.container, 'button')
  const accept = () => querySelector<HTMLButtonElement>(view!.container, 'button:last-of-type')

  it('offers both a decline and an accept action', async () => {
    view = await renderComponent(withProvider(<ConsentCard />))

    expect(view.container.textContent).toContain('Decline')
    expect(view.container.textContent).toContain('Accept')
    expect(view.container.textContent).toContain('Help improve Scrape Similar')
  })

  it('records an acceptance', async () => {
    const onDecision = vi.fn()
    view = await renderComponent(withProvider(<ConsentCard onDecision={onDecision} />))

    await view.act(() => accept().click())

    expect(await getConsentState()).toBe(true)
    expect(onDecision).toHaveBeenCalledWith(true)
  })

  it('records a refusal', async () => {
    const onDecision = vi.fn()
    view = await renderComponent(withProvider(<ConsentCard onDecision={onDecision} />))

    await view.act(() => decline().click())

    expect(await getConsentState()).toBe(false)
    expect(onDecision).toHaveBeenCalledWith(false)
  })

  it('works without a decision callback', async () => {
    view = await renderComponent(withProvider(<ConsentCard />))

    await view.act(() => accept().click())

    expect(await getConsentState()).toBe(true)
  })

  it('applies an extra class when given one', async () => {
    view = await renderComponent(withProvider(<ConsentCard className="my-card" />))

    expect(querySelector(view.container, '.my-card')).toBeTruthy()
  })

  it('lays out narrow when the viewport does not match', async () => {
    view = await renderComponent(withProvider(<ConsentCard />))

    expect(querySelector(view.container, 'h2').className).toContain('text-2xl')
  })

  it('lays out wide when the viewport matches', async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.add(listener),
          removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.delete(listener),
        }) as unknown as MediaQueryList,
    )

    view = await renderComponent(withProvider(<ConsentCard />))

    expect(querySelector(view.container, 'h2').className).toContain('text-xl')
  })

  it('re-lays out when the viewport crosses the breakpoint', async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.add(listener),
          removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.delete(listener),
        }) as unknown as MediaQueryList,
    )
    view = await renderComponent(withProvider(<ConsentCard />))

    await view.act(() => {
      for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent)
    })

    expect(querySelector(view.container, 'h2').className).toContain('text-xl')
  })
})

describe('ConsentContent', () => {
  it('explains what is and is not collected', async () => {
    view = await renderComponent(<ConsentContent />)

    expect(view.container.textContent).toContain('What we collect')
    expect(view.container.textContent).toContain("What we don't collect")
    expect(view.container.textContent).toContain('Your choice')
  })

  it('links to the privacy policy in a new tab', async () => {
    view = await renderComponent(<ConsentContent />)

    const link = querySelector<HTMLAnchorElement>(view.container, 'a')
    expect(link.href).toBe('https://digitall.studio/scrape-similar-privacy-policy.md')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener')
  })
})

describe('ConsentModal', () => {
  it('covers the page as a backdrop by default', async () => {
    view = await renderComponent(withProvider(<ConsentModal />))

    expect(querySelector(view.container, ':scope > div').className).toContain('fixed inset-0')
  })

  it('renders inline in the slide variant', async () => {
    view = await renderComponent(withProvider(<ConsentModal variant="slide" />))

    expect(querySelector(view.container, ':scope > div').className).not.toContain('fixed')
  })

  it('applies an extra class in either variant', async () => {
    view = await renderComponent(withProvider(<ConsentModal className="extra" />))
    expect(querySelector(view.container, ':scope > div').className).toContain('extra')

    await view.render(withProvider(<ConsentModal variant="slide" className="extra" />))
    expect(querySelector(view.container, ':scope > div').className).toContain('extra')
  })

  it('shows the decision buttons and the explanation together', async () => {
    view = await renderComponent(withProvider(<ConsentModal />))

    expect(view.container.textContent).toContain('Accept')
    expect(view.container.textContent).toContain('What we collect')
  })

  it('forwards the decision to its caller', async () => {
    const onConsentChange = vi.fn()
    view = await renderComponent(withProvider(<ConsentModal onConsentChange={onConsentChange} />))

    await view.act(() => {
      querySelector<HTMLButtonElement>(view!.container, 'button:last-of-type').click()
    })

    expect(onConsentChange).toHaveBeenCalledWith(true)
  })
})

describe('ConsentWrapper', () => {
  const child = <p data-testid="child">The app</p>

  it('renders nothing until the decision has loaded', async () => {
    // Never resolve the initial read, so the provider stays in its loading state.
    vi.spyOn(storage, 'getItem').mockReturnValue(new Promise(() => {}))

    view = await renderComponent(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('')
  })

  it('asks for a decision when none has been made', async () => {
    view = await renderComponent(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toContain('Help improve Scrape Similar')
    expect(view.container.querySelector('[data-testid="child"]')).toBeNull()
  })

  it('shows the app once consent is granted', async () => {
    await storage.setItem(consentKey, true)

    view = await renderComponent(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('The app')
  })

  it('shows the app once consent is declined', async () => {
    await storage.setItem(consentKey, false)

    view = await renderComponent(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('The app')
  })

  it('passes the variant and class through to the modal', async () => {
    view = await renderComponent(
      withProvider(
        <ConsentWrapper variant="slide" className="inline-consent">
          {child}
        </ConsentWrapper>,
      ),
    )

    const modal = querySelector(view.container, ':scope > div')
    expect(modal.className).toContain('inline-consent')
    expect(modal.className).not.toContain('fixed')
  })

  it('swaps the modal for the app when the user decides', async () => {
    view = await renderComponent(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    await view.act(() => {
      querySelector<HTMLButtonElement>(view!.container, 'button:last-of-type').click()
    })

    expect(view.container.textContent).toBe('The app')
  })
})
