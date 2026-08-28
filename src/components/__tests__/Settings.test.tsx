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
import log from 'loglevel'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'
import { querySelector, renderComponent, type RenderResult } from '@@/tests/support/react'

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

let view: RenderResult | undefined

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

const render = (props: Parameters<typeof Settings>[0] = {}) => renderComponent(withProviders(props))

const button = (label: string) =>
  querySelector<HTMLButtonElement>(view!.container, `button[aria-label="${label}"]`)

const rowByLabel = (label: string): HTMLElement => {
  const heading = [...view!.container.querySelectorAll('span')].find(
    (span) => span.textContent === label,
  )
  if (!heading?.parentElement) throw new Error(`No settings row labelled ${label}`)
  return heading.parentElement
}

const fileInput = () => querySelector<HTMLInputElement>(view!.container, 'input[type="file"]')

/** Drive the hidden file input as the picker would. */
const chooseFile = (contents: string) =>
  view!.act(async () => {
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

afterEach(async () => {
  await view?.cleanup()
  view = undefined
  document.body.innerHTML = ''
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

    expect(querySelector(view.container, '.settings-panel')).toBeTruthy()
  })

  describe('keyboard shortcut', () => {
    it('copies the shortcuts page address and opens a blank tab', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      view = await render()

      await view.act(() => rowByLabel('Keyboard shortcut').querySelector('button')!.click())

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

      await view.act(() => rowByLabel('System presets').querySelector('button')!.click())

      expect(await storage.getItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`)).toBeNull()
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
      expect(onResetSystemPresets).toHaveBeenCalled()
    })

    it('works without a reset callback', async () => {
      view = await render()

      await view.act(() => rowByLabel('System presets').querySelector('button')!.click())

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SYSTEM_PRESETS_RESET)
    })

    it('logs when the reset cannot be written', async () => {
      const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
      const failure = new Error('storage unavailable')
      vi.spyOn(storage, 'removeItem').mockRejectedValueOnce(failure)
      view = await render()

      await view.act(() => rowByLabel('System presets').querySelector('button')!.click())

      expect(errorSpy).toHaveBeenCalledWith('Error resetting system presets:', failure)
    })
  })

  describe('exporting presets', () => {
    it('downloads the current presets as JSON', async () => {
      await setPresets([preset()])
      view = await render()

      await view.act(() => button('Export user presets').click())

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

      await view.act(() => button('Export user presets').click())

      expect(errorSpy).toHaveBeenCalledWith('Error exporting presets:', failure)
    })
  })

  describe('importing presets', () => {
    const validFile = JSON.stringify({ version: 1, presets: [preset()] })

    it('opens the file picker', async () => {
      view = await render()
      const click = vi.spyOn(fileInput(), 'click')

      await view.act(() => button('Import user presets').click())

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

      await view.act(() => {
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

      await view.act(() => {
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

      await view.act(() => {
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

      await view.act(() => {
        const confirmButton = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent === 'Import' && candidate.closest('[role="dialog"]'),
        )
        confirmButton!.click()
      })

      expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to import presets')
      expect(errorSpy).toHaveBeenCalledWith('Error importing presets:', expect.any(Error))
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

      const toggle = querySelector(view.container, '[role="switch"]')
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    })

    it('reflects a declined consent', async () => {
      await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, false)

      view = await render()

      expect(querySelector(view.container, '[role="switch"]').getAttribute('aria-checked')).toBe(
        'false',
      )
    })

    it('records a change of mind', async () => {
      view = await render()

      await view.act(() => querySelector<HTMLElement>(view!.container, '[role="switch"]').click())

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
      view = await renderComponent(withProviders({ ref }))

      for (let i = 0; i < 5; i++) {
        await view.act(() => ref.current!.unlockDebugMode())
      }

      expect(view.container.textContent).toContain('Debug mode')
      expect(await storage.getItem('local:debugUnlocked')).toBe(true)
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
    })

    it('stays locked after four clicks', async () => {
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await renderComponent(withProviders({ ref }))

      for (let i = 0; i < 4; i++) {
        await view.act(() => ref.current!.unlockDebugMode())
      }

      expect(view.container.textContent).not.toContain('Debug mode')
    })

    it('forgets a partial click run after the window lapses', async () => {
      vi.useFakeTimers()
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await renderComponent(withProviders({ ref }))

      for (let i = 0; i < 4; i++) {
        await view.act(() => ref.current!.unlockDebugMode())
      }
      await view.act(() => {
        vi.advanceTimersByTime(HIDDEN_UNLOCK_WINDOW_MS + 1)
      })
      await view.act(() => ref.current!.unlockDebugMode())

      expect(view.container.textContent).not.toContain('Debug mode')
      vi.useRealTimers()
    })

    it('ignores further clicks once already unlocked', async () => {
      await storage.setItem('local:debugUnlocked', true)
      const ref = createRef<{ unlockDebugMode: () => void }>()
      view = await renderComponent(withProviders({ ref }))

      await view.act(() => ref.current!.unlockDebugMode())

      expect(trackEvent).not.toHaveBeenCalledWith(ANALYTICS_EVENTS.HIDDEN_SETTINGS_UNLOCK)
    })

    it('reflects the debug mode prop', async () => {
      await storage.setItem('local:debugMode', true)

      view = await render({ debugMode: true })

      const switches = [...view.container.querySelectorAll('[role="switch"]')]
      expect(switches.at(-1)!.getAttribute('aria-checked')).toBe('true')
    })

    it('reports a change and clears the unlock when turned off', async () => {
      await storage.setItem('local:debugMode', true)
      await storage.setItem('local:debugUnlocked', true)
      const onDebugModeChange = vi.fn()

      view = await render({ debugMode: true, onDebugModeChange })
      await view.act(() => {
        const switches = [...view!.container.querySelectorAll<HTMLElement>('[role="switch"]')]
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
      await view.act(() => {
        const switches = [...view!.container.querySelectorAll<HTMLElement>('[role="switch"]')]
        switches.at(-1)!.click()
      })

      expect(onDebugModeChange).toHaveBeenCalledWith(true)
      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, { enabled: true })
    })

    it('works without a change callback', async () => {
      await storage.setItem('local:debugUnlocked', true)

      view = await render()
      await view.act(() => {
        const switches = [...view!.container.querySelectorAll<HTMLElement>('[role="switch"]')]
        switches.at(-1)!.click()
      })

      expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.DEBUG_MODE_TOGGLE, { enabled: true })
    })

    it('appears when debug mode is switched on elsewhere', async () => {
      view = await render()

      await view.act(async () => {
        await storage.setItem('local:debugMode', true)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('appears when the unlock is granted elsewhere', async () => {
      view = await render()

      await view.act(async () => {
        await storage.setItem('local:debugUnlocked', true)
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(view.container.textContent).toContain('Debug mode')
    })

    it('stops listening once unmounted', async () => {
      view = await render()
      const { cleanup } = view
      view = undefined

      await cleanup()

      await expect(storage.setItem('local:debugMode', true)).resolves.toBeUndefined()
    })
  })
})
