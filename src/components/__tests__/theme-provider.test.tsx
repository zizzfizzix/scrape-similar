// @vitest-environment jsdom
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
import { act, render as renderComponent, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memo } from 'react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

let view: RenderResult

/** A controllable `(prefers-color-scheme: dark)` reply. */
const stubPrefersDark = (initialMatches: boolean) => {
  const listeners = new Set<() => void>()
  let isDarkPreferred = initialMatches
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        get matches() {
          return isDarkPreferred
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  return {
    listeners,
    /** Flip the OS preference and notify subscribers. */
    emit: (nextMatches: boolean) => {
      isDarkPreferred = nextMatches
      for (const listener of listeners) listener()
    },
  }
}

/** Renders the current theme and offers buttons to change it. */
const Probe = () => {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button data-testid="light" onClick={() => setTheme('light')} />
      <button data-testid="dark" onClick={() => setTheme('dark')} />
      <button data-testid="system" onClick={() => setTheme('system')} />
    </div>
  )
}

const currentTheme = () => view.container.querySelector('[data-testid="theme"]')!.textContent
const press = (name: string) =>
  userEvent.click(view.container.querySelector<HTMLButtonElement>(`[data-testid="${name}"]`)!)

/** Wait for the theme the provider has settled on. */
const expectTheme = (theme: string) => waitFor(() => expect(currentTheme()).toBe(theme))

beforeEach(() => {
  fakeBrowser.reset()
  document.documentElement.className = ''
})

afterEach(async () => {
  document.documentElement.className = ''
})

describe('ThemeProvider', () => {
  it('defaults to following the system', async () => {
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('system')
  })

  it('adopts the stored theme on mount', async () => {
    await storage.setItem('local:theme', 'dark')

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('dark')
  })

  it('ignores a stored value that is not a theme', async () => {
    await storage.setItem('local:theme', 'neon')

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('system')
  })

  it('applies the light class to the document root', async () => {
    // A dark system preference keeps the mount-time system phase from adding `light`.
    stubPrefersDark(true)
    await storage.setItem('local:theme', 'light')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('light')
    expect(document.documentElement.className).toBe('light')
  })

  it('replaces the previous theme class rather than stacking', async () => {
    document.documentElement.classList.add('light')
    await storage.setItem('local:theme', 'dark')

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('dark')
    expect(document.documentElement).not.toHaveClass('light')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('themes a given root element instead of the document', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    onTestFinished(() => root.remove())
    await storage.setItem('local:theme', 'dark')

    view = renderComponent(
      <ThemeProvider rootElement={root}>
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('dark')
    expect(root.className).toBe('dark')
    expect(document.documentElement.className).toBe('')
  })

  it('sets the class in the same commit that renders the theme', async () => {
    await storage.setItem('local:theme', 'dark')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    // A MutationObserver callback runs after React writes the DOM and before
    // passive effects, so it sees the class only if a layout effect set it.
    let classWhenTextChanged: string | undefined
    const observer = new MutationObserver(() => {
      if (currentTheme() === 'dark') classWhenTextChanged ??= document.documentElement.className
    })
    observer.observe(view.container, { subtree: true, childList: true, characterData: true })
    try {
      await expectTheme('dark')
    } finally {
      // Testing Library unmounts before `onTestFinished` runs, and the unmount
      // would fire this observer against an emptied container.
      observer.disconnect()
    }
    expect(classWhenTextChanged).toBe('dark')
  })

  it('follows a dark system preference', async () => {
    stubPrefersDark(true)

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows a light system preference', async () => {
    stubPrefersDark(false)

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement).toHaveClass('light')
  })

  it('reacts when the system preference changes', async () => {
    const media = stubPrefersDark(false)
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await act(() => media.emit(true))

    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).not.toHaveClass('light')
  })

  it('stops following the system once a theme is chosen', async () => {
    const media = stubPrefersDark(true)
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await press('light')

    await expectTheme('light')
    expect(document.documentElement).toHaveClass('light')
    expect(media.listeners.size).toBe(0)
  })

  it('persists a chosen theme', async () => {
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await press('dark')

    expect(await storage.getItem('local:theme')).toBe('dark')
  })

  it('goes back to following the system when asked', async () => {
    stubPrefersDark(true)
    await storage.setItem('local:theme', 'light')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await expectTheme('light')

    await press('system')

    await expectTheme('system')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('picks up a theme changed elsewhere', async () => {
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await act(async () => {
      await storage.setItem('local:theme', 'dark')
      await flushMicrotasks()
    })

    await expectTheme('dark')
  })

  it('falls back to the system theme when a non-theme value is written elsewhere', async () => {
    await storage.setItem('local:theme', 'light')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await expectTheme('light')

    await act(async () => {
      await storage.setItem('local:theme', 'neon')
      await flushMicrotasks()
    })

    await expectTheme('system')
  })

  it('resets to the system theme when the stored theme is cleared elsewhere', async () => {
    await storage.setItem('local:theme', 'dark')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await expectTheme('dark')

    await act(async () => {
      await storage.removeItem('local:theme')
      await flushMicrotasks()
    })

    await expectTheme('system')
  })

  it('keeps the context value when it re-renders with nothing changed', async () => {
    const seen: ReturnType<typeof useTheme>[] = []
    // `memo` limits the consumer's renders to context changes.
    const Consumer = memo(function Consumer() {
      seen.push(useTheme())
      return null
    })
    const Parent = ({ tick }: { tick: number }) => (
      <ThemeProvider>
        <span data-tick={tick} />
        <Consumer />
      </ThemeProvider>
    )
    view = renderComponent(<Parent tick={0} />)
    await act(flushMicrotasks)
    const rendersBefore = seen.length

    view.rerender(<Parent tick={1} />)

    expect(seen).toHaveLength(rendersBefore)
  })

  it('stops listening once unmounted', async () => {
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    view.unmount()

    await expect(storage.setItem('local:theme', 'dark')).resolves.toBeUndefined()
  })
})

describe('useTheme', () => {
  it('falls back to the default context outside a provider', async () => {
    view = renderComponent(<Probe />)

    await expectTheme('system')
  })

  it('has a no-op setter outside a provider', async () => {
    view = renderComponent(<Probe />)

    await press('dark')

    await expectTheme('system')
  })
})
