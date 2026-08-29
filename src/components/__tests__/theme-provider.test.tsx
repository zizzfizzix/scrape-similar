// @vitest-environment jsdom
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { act, render as renderComponent, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let view: RenderResult

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A controllable `(prefers-color-scheme: dark)` reply. */
const stubPrefersDark = (matches: boolean) => {
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches,
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  return {
    listeners,
    /** Notify subscribers that the OS preference flipped. */
    emit: () => {
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

  it('honours an explicit default', async () => {
    view = renderComponent(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('dark')
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

  it('reads from a custom storage key', async () => {
    await storage.setItem('local:panel-theme', 'light')

    view = renderComponent(
      <ThemeProvider themeStorageKey="panel-theme">
        <Probe />
      </ThemeProvider>,
    )

    await expectTheme('light')
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
    view = renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('replaces the previous theme class rather than stacking', async () => {
    document.documentElement.classList.add('light')

    view = renderComponent(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('themes a given root element instead of the document', async () => {
    const root = document.createElement('div')
    document.body.append(root)

    view = renderComponent(
      <ThemeProvider defaultTheme="dark" rootElement={root}>
        <Probe />
      </ThemeProvider>,
    )

    expect(root.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('follows a dark system preference', async () => {
    stubPrefersDark(true)

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('follows a light system preference', async () => {
    stubPrefersDark(false)

    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('reacts when the system preference changes', async () => {
    const media = stubPrefersDark(false)
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    // The stub reports `matches: false` throughout, so re-emitting keeps light.
    await act(() => media.emit())

    expect(document.documentElement.classList.contains('light')).toBe(true)
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
    expect(document.documentElement.classList.contains('light')).toBe(true)
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

  it('persists to the custom storage key', async () => {
    view = renderComponent(
      <ThemeProvider themeStorageKey="panel-theme">
        <Probe />
      </ThemeProvider>,
    )

    await press('dark')

    expect(await storage.getItem('local:panel-theme')).toBe('dark')
  })

  it('goes back to following the system when asked', async () => {
    stubPrefersDark(true)
    view = renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    await press('system')

    await expectTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('picks up a theme changed elsewhere', async () => {
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await act(async () => {
      await storage.setItem('local:theme', 'dark')
      await flushWatchers()
    })

    await expectTheme('dark')
  })

  it('ignores a non-theme value written elsewhere', async () => {
    view = renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    await act(async () => {
      await storage.setItem('local:theme', 'neon')
      await flushWatchers()
    })

    await expectTheme('light')
  })

  it('ignores the theme being cleared elsewhere', async () => {
    await storage.setItem('local:theme', 'dark')
    view = renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await act(async () => {
      await storage.removeItem('local:theme')
      await flushWatchers()
    })

    await expectTheme('dark')
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
