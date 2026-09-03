import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
// @vitest-environment jsdom
import { ConsentProvider } from '@/components/consent-provider'
import { Settings } from '@/components/Settings'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import { HIDDEN_UNLOCK_WINDOW_MS, PRESET_EXPORT_FILENAME } from '@/utils/preset-transfer'
import { getPresets, setPresets, userPresetsStorage } from '@/utils/storage'
import { SYSTEM_PRESET_STATUS_KEY, type Preset } from '@/utils/types'
import { act, render as renderComponent, type RenderResult } from '@testing-library/react'
import userEventBase from '@testing-library/user-event'
import log from 'loglevel'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

// user-event waits between the events it dispatches. Some of these tests
// install fake timers, and nothing would advance that wait, so hand it the
// clock they control.
const userEvent = userEventBase.setup({
  advanceTimers: (ms) => {
    if (vi.isFakeTimers()) vi.advanceTimersByTime(ms)
  },
})

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('sonner', () => toastMocks)

const downloadMocks = vi.hoisted(() => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/export-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/export-data')>()),
  downloadFile: downloadMocks.downloadFile,
}))

let view: RenderResult

const preset = (id = 'p1'): Preset => ({
  id,
  name: 'Links',
  config: { mainSelector: '//a', columns: [{ name: 'URL', selector: '@href' }] },
  createdAt: 1_700_000_000_000,
})

/** The entrypoints wrap Settings in these providers; Tooltip requires its own. */
const withProviders = (props: Parameters<typeof Settings>[0] = {}) => (
  <ConsentProvider>
    <ThemeProvider>
      <TooltipProvider>
        <Settings {...props} />
      </TooltipProvider>
    </ThemeProvider>
  </ConsentProvider>
)

/** Render `ui`, and let mount-time storage reads settle before asserting. */
const render2 = async (ui: React.ReactNode) => {
  const rendered = renderComponent(ui)
  await act(async () => {})
  return rendered
}

/** Render Settings inside the providers the entrypoints wrap it in. */
const render = (props: Parameters<typeof Settings>[0] = {}) => render2(withProviders(props))

const button = (label: string) =>
  view.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

const rowByLabel = (label: string): HTMLElement => {
  const heading = [...view.container.querySelectorAll('span')].find(
    (span) => span.textContent === label,
  )
  if (!heading?.parentElement) throw new Error(`No settings row labelled ${label}`)
  return heading.parentElement
}

const fileInput = () => view.container.querySelector<HTMLInputElement>('input[type="file"]')!

/** Drive the hidden file input as the picker would. */
const chooseFile = (contents: string) =>
  act(async () => {
    const input = fileInput()
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ text: () => Promise.resolve(contents) }],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    // Let the async change handler settle.
    await Promise.resolve()
    await Promise.resolve()
  })

beforeEach(async () => {
  fakeBrowser.reset()
  await userPresetsStorage.setValue([])
})

describe('Settings', () => {
  it('lists the always-visible settings rows', async () => {
    view = await render()

    expect(view.container.textContent).toContain('Theme')
    expect(view.container.textContent).toContain('Keyboard shortcut')
    expect(view.container.textContent).toContain('System presets')
    expect(view.container.textContent).toContain('User presets')
  })

  it('applies an extra class when given one', async () => {
    view = await render({ className: 'settings-panel' })

    expect(view.container.querySelector('.settings-panel')).toBeTruthy()
  })

  describe('keyboard shortcut', () => {
    it('copies the shortcuts page address and opens a blank tab', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      view = await render()

      await userEvent.click(rowByLabel('Keyboard shortcut').querySelector('button')!)

      expect(writeText).toHaveBeenCalledWith(
        'chrome://extensions/shortcuts#:~:text=Scrape%20Similar',
      )
      expect(open).toHaveBeenCalledWith('about:blank', '_blank')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.KEYBOARD_SHORTCUT_COPY)
      vi.unstubAllGlobals()
    })
  })

  describe('system presets', () => {
    it('clears the hidden-preset state and notifies the caller', async () => {
      await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, { 'system-1': false })
      const onResetSystemPresets = vi.fn()
      view = await render({ onResetSystemPresets })

      await userEvent.click(rowByLabel('System presets').querySelector('button')!)

      expect(await storage.getItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`)).toBeNull()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
      expect(onResetSystemPresets).toHaveBeenCalled()
    })

    it('works without a reset callback', async () => {
      view = await render()

      await userEvent.click(rowByLabel('System presets').querySelector('button')!)

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
    })

    it('logs when the reset cannot be written', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      const failure = new Error('storage unavailable')
      vi.spyOn(storage, 'removeItem').mockRejectedValueOnce(failure)
      view = await render()

      await userEvent.click(rowByLabel('System presets').querySelector('button')!)

      expect(errorSpy).toHaveBeenCalledWith('Error resetting system presets:', failure)
    })
  })

  describe('exporting presets', () => {
    it('downloads the current presets as JSON', async () => {
      await setPresets([preset()])
      view = await render()

      await userEvent.click(button('Export user presets'))

      expect(downloadMocks.downloadFile).toHaveBeenCalledWith(
        expect.stringContaining('"presets"'),
        PRESET_EXPORT_FILENAME,
        'application/json',
      )
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_EXPORT, { presetCount: 1 })
    })

    it('logs when the download cannot be produced', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      const failure = new Error('no blob support')
      downloadMocks.downloadFile.mockImplementationOnce(() => {
        throw failure
      })
      view = await render()

      await userEvent.click(button('Export user presets'))

      expect(errorSpy).toHaveBeenCalledWith('Error exporting presets:', failure)
    })
  })

  describe('importing presets', () => {
    const validFile = JSON.stringify({ version: 1, presets: [preset()] })

    it('opens the file picker', async () => {
      view = await render()
      const click = vi.spyOn(fileInput(), 'click')

      await userEvent.click(button('Import user presets'))

      expect(click).toHaveBeenCalled()
    })

    it('asks for confirmation before replacing the presets', async () => {
      view = await render()

      await chooseFile(validFile)

      expect(document.body.textContent).toContain('Current presets will be lost.')
      expect(await getPresets()).toEqual([])
    })

    it('replaces the presets once confirmed', async () => {
      const onPresetsImported = vi.fn()
      view = await render({ onPresetsImported })
      await chooseFile(validFile)

      await act(() => {
        const confirmButton = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent === 'Import' && candidate.closest('[role="dialog"]'),
        )
        confirmButton!.click()
      })

      expect(await getPresets()).toEqual([preset()])
      expect(toastMocks.toast.success).toHaveBeenCalledWith('Imported 1 presets.')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_IMPORT, {
        success: true,
        presetCount: 1,
      })
      expect(onPresetsImported).toHaveBeenCalled()
    })

    it('leaves the presets alone when cancelled', async () => {
      await setPresets([preset('existing')])
      view = await render()
      await chooseFile(validFile)

      await act(() => {
        const cancel = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent === 'Cancel',
        )
        cancel!.click()
      })

      expect((await getPresets())[0]?.id).toBe('existing')
    })

    it('reports a file it cannot read', async () => {
      view = await render()

      await chooseFile('{ not json')

      expect(toastMocks.toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read preset file'),
      )
      expect(trackEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.PRESET_IMPORT,
        expect.objectContaining({ success: false }),
      )
    })

    it('reports an invalid preset file', async () => {
      view = await render()

      await chooseFile(JSON.stringify({ presets: [] }))

      expect(toastMocks.toast.error).toHaveBeenCalledWith(
        'Invalid preset file: missing "version" field.',
      )
    })

    it('does nothing when the picker is dismissed without a file', async () => {
      view = await render()

      await act(() => {
        fileInput().dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(toastMocks.toast.error).not.toHaveBeenCalled()
      expect(document.body.textContent).not.toContain('Current presets will be lost.')
    })

    it('reports a failure to write the imported presets', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      view = await render()
      await chooseFile(validFile)
      vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValueOnce(new Error('quota exceeded'))

      await act(() => {
        const confirmButton = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent === 'Import' && candidate.closest('[role="dialog"]'),
        )
        confirmButton!.click()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to import presets')
      expect(errorSpy).toHaveBeenCalledWith('Error importing presets:', expect.any(Error))
    })

    it('falls back to a generic reason when the caller throws a non-Error', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      view = await render({
        onPresetsImported: () => {
          throw 'callback exploded'
        },
      })
      await chooseFile(validFile)

      await act(() => {
        const confirmButton = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent === 'Import' && candidate.closest('[role="dialog"]'),
        )
        confirmButton!.click()
      })

      expect(errorSpy).toHaveBeenCalledWith('Error importing presets:', 'callback exploded')
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.PRESET_IMPORT, {
        success: false,
        reason: 'Import failed',
      })
    })

    it('notes skipped system presets in the confirmation', async () => {
      const { SYSTEM_PRESETS } = await import('@/utils/system_presets')
      view = await render()

      await chooseFile(JSON.stringify({ version: 1, presets: [preset(), SYSTEM_PRESETS[0]] }))

      expect(document.body.textContent).toContain('preset(s) were skipped')
    })
  })

  describe('analytics consent', () => {
    it('reflects a granted consent', async () => {
      await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)

      view = await render()

      const toggle = view.container.querySelector('[role="switch"]')!
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })

    it('reflects a declined consent', async () => {
      await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, false)

      view = await render()

      expect(view.container.querySelector('[role="switch"]')!).toHaveAttribute(
        'aria-checked',
        'false',
      )
    })

    it('records a change of mind', async () => {
      view = await render()

      await act(() => view.container.querySelector<HTMLElement>('[role="switch"]')!.click())

      expect(await storage.getItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`)).toBe(true)
    })

    it('hides the row until the stored decision has loaded', async () => {
      vi.spyOn(storage, 'getItem').mockReturnValue(new Promise(() => {}))

      view = await render()

      expect(view.container.textContent).not.toContain('Anonymous analytics')
    })
  })

  describe('debug mode', () => {
    it('stays hidden by default', async () => {
      view = await render()

      expect(view.container.textContent).not.toContain('Debug mode')
    })

    it('shows when debug mode is already on in storage', async () => {
      await storage.setItem('local:debugMode', true)

      view = await render()

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('shows when it has been unlocked before', async () => {
      await storage.setItem('local:debugUnlocked', true)

      view = await render()

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('unlocks after five title clicks', async () => {
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await render2(withProviders({ ref }))

      for (let i = 0; i < 5; i++) {
        await act(() => ref.current!.unlockDebugMode())
      }

      expect(view.container.textContent).toContain('Debug mode')
      expect(await storage.getItem('local:debugUnlocked')).toBe(true)
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
    })

    it('stays locked after four clicks', async () => {
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await render2(withProviders({ ref }))

      for (let i = 0; i < 4; i++) {
        await act(() => ref.current!.unlockDebugMode())
      }

      expect(view.container.textContent).not.toContain('Debug mode')
    })

    it('forgets a partial click run after the window lapses', async () => {
      vi.useFakeTimers()
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await render2(withProviders({ ref }))

      for (let i = 0; i < 4; i++) {
        await act(() => ref.current!.unlockDebugMode())
      }
      await act(() => {
        vi.advanceTimersByTime(HIDDEN_UNLOCK_WINDOW_MS + 1)
      })
      await act(() => ref.current!.unlockDebugMode())

      expect(view.container.textContent).not.toContain('Debug mode')
      vi.useRealTimers()
    })

    it('ignores further clicks once already unlocked', async () => {
      await storage.setItem('local:debugUnlocked', true)
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await render2(withProviders({ ref }))

      await act(() => ref.current!.unlockDebugMode())

      expect(trackEvent).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
    })

    it('reflects the debug mode prop', async () => {
      await storage.setItem('local:debugMode', true)

      view = await render({ debugMode: true })

      const switches = [...view.container.querySelectorAll('[role="switch"]')]
      expect(switches.at(-1)!).toHaveAttribute('aria-checked', 'true')
    })

    it('reports a change and clears the unlock when turned off', async () => {
      await storage.setItem('local:debugMode', true)
      await storage.setItem('local:debugUnlocked', true)
      const onDebugModeChange = vi.fn()

      view = await render({ debugMode: true, onDebugModeChange })
      await act(() => {
        const switches = [...view.container.querySelectorAll<HTMLElement>('[role="switch"]')]
        switches.at(-1)!.click()
      })

      expect(onDebugModeChange).toHaveBeenCalledWith(false)
      expect(await storage.getItem('local:debugUnlocked')).toBeNull()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, {
        enabled: false,
      })
    })

    it('reports being turned on', async () => {
      await storage.setItem('local:debugUnlocked', true)
      const onDebugModeChange = vi.fn()

      view = await render({ onDebugModeChange })
      await act(() => {
        const switches = [...view.container.querySelectorAll<HTMLElement>('[role="switch"]')]
        switches.at(-1)!.click()
      })

      expect(onDebugModeChange).toHaveBeenCalledWith(true)
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, { enabled: true })
    })

    it('works without a change callback', async () => {
      await storage.setItem('local:debugUnlocked', true)

      view = await render()
      await act(() => {
        const switches = [...view.container.querySelectorAll<HTMLElement>('[role="switch"]')]
        switches.at(-1)!.click()
      })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, { enabled: true })
    })

    it('appears when debug mode is switched on elsewhere', async () => {
      view = await render()

      await act(async () => {
        await storage.setItem('local:debugMode', true)
        await flushMicrotasks()
      })

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('appears when the unlock is granted elsewhere', async () => {
      view = await render()

      await act(async () => {
        await storage.setItem('local:debugUnlocked', true)
        await flushMicrotasks()
      })

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('stops listening once unmounted', async () => {
      view = await render()
      view.unmount()

      await expect(storage.setItem('local:debugMode', true)).resolves.toBeUndefined()
    })
  })
})
