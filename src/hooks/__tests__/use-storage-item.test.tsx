// @vitest-environment jsdom
import { useDebugMode } from '@/hooks/use-debug-mode'
import { useStorageItem } from '@/hooks/use-storage-item'
import { act, renderHook, waitFor } from '@testing-library/react'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const modeFlags = vi.hoisted(() => ({ isDevOrTest: false }))
vi.mock('@/utils/modeTest', () => ({
  get isDevOrTest() {
    return modeFlags.isDevOrTest
  },
}))

/** Give storage watchers a macrotask to fire. */
const flushWatchers = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  fakeBrowser.reset()
  modeFlags.isDevOrTest = false
})

describe('useStorageItem', () => {
  it('starts at the default and then loads what is stored', async () => {
    await storage.setItem('local:debugMode', true)

    const { result } = renderHook(() => useStorageItem(debugModeItem))

    expect(result.current[0]).toBe(false)
    await waitFor(() => expect(result.current[0]).toBe(true))
  })

  it('follows a write made elsewhere', async () => {
    const { result } = renderHook(() => useStorageItem(debugModeItem))

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(result.current[0]).toBe(true)
  })

  it('takes its own writes from storage', async () => {
    const { result } = renderHook(() => useStorageItem(debugModeItem))

    await act(async () => {
      await result.current[1](true)
      await flushWatchers()
    })

    expect(result.current[0]).toBe(true)
    expect(await storage.getItem('local:debugMode')).toBe(true)
  })

  it('resets to the default when the key is removed', async () => {
    await storage.setItem('local:debugMode', true)
    const { result } = renderHook(() => useStorageItem(debugModeItem))
    await waitFor(() => expect(result.current[0]).toBe(true))

    await act(async () => {
      await storage.removeItem('local:debugMode')
      await flushWatchers()
    })

    expect(result.current[0]).toBe(false)
  })

  it('stops listening once unmounted', async () => {
    const { result, unmount } = renderHook(() => useStorageItem(debugModeItem))
    unmount()

    await act(async () => {
      await storage.setItem('local:debugMode', true)
      await flushWatchers()
    })

    expect(result.current[0]).toBe(false)
  })
})

describe('useDebugMode', () => {
  it('logs at error level while debug mode is off', async () => {
    const setLevel = vi.spyOn(log, 'setLevel')

    renderHook(() => useDebugMode())

    await waitFor(() => expect(setLevel).toHaveBeenLastCalledWith('error'))
  })

  it('logs at trace level once debug mode is turned on', async () => {
    const setLevel = vi.spyOn(log, 'setLevel')
    const { result } = renderHook(() => useDebugMode())

    await act(async () => {
      await result.current[1](true)
      await flushWatchers()
    })

    expect(result.current[0]).toBe(true)
    expect(setLevel).toHaveBeenLastCalledWith('trace')
  })

  it('always logs at trace level in development and test builds', async () => {
    modeFlags.isDevOrTest = true
    const setLevel = vi.spyOn(log, 'setLevel')

    renderHook(() => useDebugMode())

    await waitFor(() => expect(setLevel).toHaveBeenCalledWith('trace'))
    expect(setLevel).not.toHaveBeenCalledWith('error')
  })
})
