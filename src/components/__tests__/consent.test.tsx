// @vitest-environment jsdom
import { ConsentProvider, useConsent } from '@/components/consent-provider'
import { ConsentCard } from '@/components/ConsentCard'
import { ConsentContent } from '@/components/ConsentContent'
import { ConsentModal } from '@/components/ConsentModal'
import { ConsentWrapper } from '@/components/ConsentWrapper'
import { ANALYTICS_CONSENT_STORAGE_KEY, getConsentState } from '@/utils/consent'
import { type RenderResult, act, render as renderComponent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

let view: RenderResult

const consentKey = `sync:${ANALYTICS_CONSENT_STORAGE_KEY}` as const

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

const withProvider = (children: ReactNode) => <ConsentProvider>{children}</ConsentProvider>

/** Render, and let the provider's storage read settle before asserting. */
const render = async (ui: ReactNode) => {
  const rendered = renderComponent(ui)
  await act(async () => {})
  return rendered
}

beforeEach(() => {
  fakeBrowser.reset()
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

  const probeText = () => view.container.querySelector('[data-testid="probe"]')!.textContent

  it('reports the stored decision once loaded', async () => {
    await storage.setItem(consentKey, true)

    view = await render(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('reports an undecided state when nothing is stored', async () => {
    view = await render(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('reports a declined decision', async () => {
    await storage.setItem(consentKey, false)

    view = await render(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: false }))
  })

  it('treats an unreadable store as undecided', async () => {
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'))

    view = await render(withProvider(<Probe />))

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('persists a decision made through the context', async () => {
    view = await render(withProvider(<Probe />))

    await act(() => {
      view.container.querySelector<HTMLButtonElement>('[data-testid="probe"]')!.click()
    })

    expect(await getConsentState()).toBe(true)
    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('picks up a decision made elsewhere', async () => {
    view = await render(withProvider(<Probe />))

    await act(async () => {
      await storage.setItem(consentKey, true)
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false, state: true }))
  })

  it('returns to undecided when the decision is cleared elsewhere', async () => {
    await storage.setItem(consentKey, true)
    view = await render(withProvider(<Probe />))

    await act(async () => {
      await storage.removeItem(consentKey)
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('treats a blank stored value as undecided', async () => {
    await storage.setItem(consentKey, true)
    view = await render(withProvider(<Probe />))

    await act(async () => {
      await storage.setItem(consentKey, '')
      await flushWatchers()
    })

    expect(probeText()).toBe(JSON.stringify({ loading: false }))
  })

  it('stops listening once unmounted', async () => {
    view = await render(withProvider(<Probe />))
    view.unmount()

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

    // RTL's render is synchronous, so the hook's error is thrown, not rejected.
    expect(() => renderComponent(<Orphan />)).toThrow(
      'useConsent must be used within <ConsentProvider>',
    )

    errorSpy.mockRestore()
  })
})

describe('ConsentCard', () => {
  const decline = () => view.container.querySelector<HTMLButtonElement>('button')!
  const accept = () => view.container.querySelector<HTMLButtonElement>('button:last-of-type')!

  it('offers both a decline and an accept action', async () => {
    view = await render(withProvider(<ConsentCard />))

    expect(view.container.textContent).toContain('Decline')
    expect(view.container.textContent).toContain('Accept')
    expect(view.container.textContent).toContain('Help improve Scrape Similar')
  })

  it('records an acceptance', async () => {
    const onDecision = vi.fn()
    view = await render(withProvider(<ConsentCard onDecision={onDecision} />))

    await userEvent.click(accept())

    expect(await getConsentState()).toBe(true)
    expect(onDecision).toHaveBeenCalledWith(true)
  })

  it('records a refusal', async () => {
    const onDecision = vi.fn()
    view = await render(withProvider(<ConsentCard onDecision={onDecision} />))

    await userEvent.click(decline())

    expect(await getConsentState()).toBe(false)
    expect(onDecision).toHaveBeenCalledWith(false)
  })

  it('works without a decision callback', async () => {
    view = await render(withProvider(<ConsentCard />))

    await userEvent.click(accept())

    expect(await getConsentState()).toBe(true)
  })

  it('applies an extra class when given one', async () => {
    view = await render(withProvider(<ConsentCard className="my-card" />))

    expect(view.container.querySelector('.my-card')).toBeTruthy()
  })

  it('lays out narrow when the viewport does not match', async () => {
    view = await render(withProvider(<ConsentCard />))

    expect(view.container.querySelector('h2')!.className).toContain('text-2xl')
  })

  /**
   * `useMediaQuery` reads `matches` back off the list rather than off the
   * event, so the stub has to move with the breakpoint the way a real
   * `MediaQueryList` does.
   */
  const stubMatchMedia = (matches: boolean) => {
    const listeners = new Set<() => void>()
    const list = {
      matches,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ ...list, media: query }) as unknown as MediaQueryList,
    )
    return (next: boolean) => {
      list.matches = next
      for (const listener of listeners) listener()
    }
  }

  it('lays out wide when the viewport matches', async () => {
    stubMatchMedia(true)

    view = await render(withProvider(<ConsentCard />))

    expect(view.container.querySelector('h2')!.className).toContain('text-xl')
  })

  it('re-lays out when the viewport crosses the breakpoint', async () => {
    const cross = stubMatchMedia(false)
    view = await render(withProvider(<ConsentCard />))

    await act(() => {
      cross(true)
    })

    expect(view.container.querySelector('h2')!.className).toContain('text-xl')
  })
})

describe('ConsentContent', () => {
  it('explains what is and is not collected', async () => {
    view = await render(<ConsentContent />)

    expect(view.container.textContent).toContain('What we collect')
    expect(view.container.textContent).toContain("What we don't collect")
    expect(view.container.textContent).toContain('Your choice')
  })

  it('links to the privacy policy in a new tab', async () => {
    view = await render(<ConsentContent />)

    const link = view.container.querySelector<HTMLAnchorElement>('a')!
    expect(link.href).toBe('https://digitall.studio/scrape-similar-privacy-policy.md')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener')
  })
})

describe('ConsentModal', () => {
  it('covers the page as a backdrop by default', async () => {
    view = await render(withProvider(<ConsentModal />))

    expect(view.container.querySelector(':scope > div')!.className).toContain('fixed inset-0')
  })

  it('renders inline in the slide variant', async () => {
    view = await render(withProvider(<ConsentModal variant="slide" />))

    expect(view.container.querySelector(':scope > div')!.className).not.toContain('fixed')
  })

  it('applies an extra class in either variant', async () => {
    view = await render(withProvider(<ConsentModal className="extra" />))
    expect(view.container.querySelector(':scope > div')!.className).toContain('extra')

    view.rerender(withProvider(<ConsentModal variant="slide" className="extra" />))
    expect(view.container.querySelector(':scope > div')!.className).toContain('extra')
  })

  it('shows the decision buttons and the explanation together', async () => {
    view = await render(withProvider(<ConsentModal />))

    expect(view.container.textContent).toContain('Accept')
    expect(view.container.textContent).toContain('What we collect')
  })

  it('forwards the decision to its caller', async () => {
    const onConsentChange = vi.fn()
    view = await render(withProvider(<ConsentModal onConsentChange={onConsentChange} />))

    await act(() => {
      view.container.querySelector<HTMLButtonElement>('button:last-of-type')!.click()
    })

    expect(onConsentChange).toHaveBeenCalledWith(true)
  })
})

describe('ConsentWrapper', () => {
  const child = <p data-testid="child">The app</p>

  it('renders nothing until the decision has loaded', async () => {
    // Never resolve the initial read, so the provider stays in its loading state.
    vi.spyOn(storage, 'getItem').mockReturnValue(new Promise(() => {}))

    view = await render(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('')
  })

  it('asks for a decision when none has been made', async () => {
    view = await render(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toContain('Help improve Scrape Similar')
    expect(view.container.querySelector('[data-testid="child"]')).toBeNull()
  })

  it('shows the app once consent is granted', async () => {
    await storage.setItem(consentKey, true)

    view = await render(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('The app')
  })

  it('shows the app once consent is declined', async () => {
    await storage.setItem(consentKey, false)

    view = await render(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    expect(view.container.textContent).toBe('The app')
  })

  it('passes the variant and class through to the modal', async () => {
    view = await render(
      withProvider(
        <ConsentWrapper variant="slide" className="inline-consent">
          {child}
        </ConsentWrapper>,
      ),
    )

    const modal = view.container.querySelector(':scope > div')!
    expect(modal.className).toContain('inline-consent')
    expect(modal.className).not.toContain('fixed')
  })

  it('swaps the modal for the app when the user decides', async () => {
    view = await render(withProvider(<ConsentWrapper>{child}</ConsentWrapper>))

    await act(() => {
      view.container.querySelector<HTMLButtonElement>('button:last-of-type')!.click()
    })

    expect(view.container.textContent).toBe('The app')
  })
})
