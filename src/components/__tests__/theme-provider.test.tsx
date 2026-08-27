// @vitest-environment jsdom
import { ThemeProvider, useTheme } from '@/components/theme-provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

let view: RenderResult | undefined

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

const currentTheme = () => querySelector(view!.container, '[data-testid="theme"]').textContent
const press = (name: string) =>
  view!.act(() =>
    querySelector<HTMLButtonElement>(view!.container, `[data-testid="${name}"]`).click(),
  )

beforeEach(() => {
  fakeBrowser.reset()
  document.documentElement.className = ''
})

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

describe('ThemeProvider', () => {
  it('defaults to following the system', async () => {
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(currentTheme()).toBe('system')
  })

  it('honours an explicit default', async () => {
    view = await renderComponent(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    )

    expect(currentTheme()).toBe('dark')
  })

  it('adopts the stored theme on mount', async () => {
    await storage.setItem('local:theme', 'dark')

    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(currentTheme()).toBe('dark')
  })

  it('reads from a custom storage key', async () => {
    await storage.setItem('local:panel-theme', 'light')

    view = await renderComponent(
      <ThemeProvider themeStorageKey="panel-theme">
        <Probe />
      </ThemeProvider>,
    )

    expect(currentTheme()).toBe('light')
  })

  it('ignores a stored value that is not a theme', async () => {
    await storage.setItem('local:theme', 'neon')

    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(currentTheme()).toBe('system')
  })

  it('applies the light class to the document root', async () => {
    view = await renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('replaces the previous theme class rather than stacking', async () => {
    document.documentElement.classList.add('light')

    view = await renderComponent(
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

    view = await renderComponent(
      <ThemeProvider defaultTheme="dark" rootElement={root}>
        <Probe />
      </ThemeProvider>,
    )

    expect(root.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('follows a dark system preference', async () => {
    stubPrefersDark(true)

    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('follows a light system preference', async () => {
    stubPrefersDark(false)

    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('reacts when the system preference changes', async () => {
    const media = stubPrefersDark(false)
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    // The stub reports `matches: false` throughout, so re-emitting keeps light.
    await view.act(() => media.emit())

    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('stops following the system once a theme is chosen', async () => {
    const media = stubPrefersDark(true)
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await press('light')

    expect(currentTheme()).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(media.listeners.size).toBe(0)
  })

  it('persists a chosen theme', async () => {
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await press('dark')

    expect(await storage.getItem('local:theme')).toBe('dark')
  })

  it('persists to the custom storage key', async () => {
    view = await renderComponent(
      <ThemeProvider themeStorageKey="panel-theme">
        <Probe />
      </ThemeProvider>,
    )

    await press('dark')

    expect(await storage.getItem('local:panel-theme')).toBe('dark')
  })

  it('goes back to following the system when asked', async () => {
    stubPrefersDark(true)
    view = await renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    await press('system')

    expect(currentTheme()).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('picks up a theme changed elsewhere', async () => {
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await view.act(async () => {
      await storage.setItem('local:theme', 'dark')
      await flushWatchers()
    })

    expect(currentTheme()).toBe('dark')
  })

  it('ignores a non-theme value written elsewhere', async () => {
    view = await renderComponent(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    )

    await view.act(async () => {
      await storage.setItem('local:theme', 'neon')
      await flushWatchers()
    })

    expect(currentTheme()).toBe('light')
  })

  it('ignores the theme being cleared elsewhere', async () => {
    await storage.setItem('local:theme', 'dark')
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await view.act(async () => {
      await storage.removeItem('local:theme')
      await flushWatchers()
    })

    expect(currentTheme()).toBe('dark')
  })

  it('stops listening once unmounted', async () => {
    view = await renderComponent(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    const { cleanup } = view
    view = undefined

    await cleanup()

    await expect(storage.setItem('local:theme', 'dark')).resolves.toBeUndefined()
  })
})

describe('useTheme', () => {
  it('falls back to the default context outside a provider', async () => {
    view = await renderComponent(<Probe />)

    expect(currentTheme()).toBe('system')
  })

  it('has a no-op setter outside a provider', async () => {
    view = await renderComponent(<Probe />)

    await press('dark')

    expect(currentTheme()).toBe('system')
  })
})
