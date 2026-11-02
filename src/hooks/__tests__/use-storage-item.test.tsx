// @vitest-environment jsdom
import { useDebugMode } from '@/hooks/use-debug-mode'
import { useLoadedStorageItem, useStorageItem } from '@/hooks/use-storage-item'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
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
      await flushMicrotasks()
    })

    expect(result.current[0]).toBe(true)
  })

  it('takes its own writes from storage', async () => {
    const { result } = renderHook(() => useStorageItem(debugModeItem))

    await act(async () => {
      await result.current[1](true)
      await flushMicrotasks()
    })

    expect(result.current[0]).toBe(true)
    expect(await storage.getItem('local:debugMode')).toBe(true)
  })

  it('keeps the setter identity until the item changes', async () => {
    const otherItem = storage.defineItem<boolean>('local:otherFlag', { fallback: false })
    const { result, rerender } = renderHook(({ item }) => useStorageItem(item), {
      initialProps: { item: debugModeItem },
    })
    const firstSetter = result.current[1]

    rerender({ item: debugModeItem })
    expect(result.current[1]).toBe(firstSetter)

    rerender({ item: otherItem })
    expect(result.current[1]).not.toBe(firstSetter)
    await act(flushMicrotasks)
  })

  it('resets to the default when the key is removed', async () => {
    await storage.setItem('local:debugMode', true)
    const { result } = renderHook(() => useStorageItem(debugModeItem))
    await waitFor(() => expect(result.current[0]).toBe(true))

    await act(async () => {
      await storage.removeItem('local:debugMode')
      await flushMicrotasks()
    })

    expect(result.current[0]).toBe(false)
  })

  it('stops listening once unmounted', () => {
    const unwatch = vi.fn()
    vi.spyOn(debugModeItem, 'watch').mockReturnValueOnce(unwatch)
    const { unmount } = renderHook(() => useStorageItem(debugModeItem))
    expect(unwatch).not.toHaveBeenCalled()

    unmount()

    expect(unwatch).toHaveBeenCalledOnce()
  })

  it('shows the new item, not the old value, when the item changes', async () => {
    await storage.setItem('local:debugMode', true)
    const { result, rerender } = renderHook(({ item }) => useStorageItem(item), {
      initialProps: { item: debugModeItem },
    })
    await waitFor(() => expect(result.current[0]).toBe(true))

    rerender({ item: debugUnlockedItem })
    expect(result.current[0]).toBe(false)

    await act(async () => {
      await storage.setItem('local:debugUnlocked', true)
      await flushMicrotasks()
    })
    expect(result.current[0]).toBe(true)
  })
})

describe('useLoadedStorageItem', () => {
  it('has no value until the stored one has been read', async () => {
    await storage.setItem('local:debugMode', true)

    const { result } = renderHook(() => useLoadedStorageItem(debugModeItem))

    expect(result.current[0]).toBeUndefined()
    await waitFor(() => expect(result.current[0]).toBe(true))
  })

  it('settles on the default when nothing is stored', async () => {
    const { result } = renderHook(() => useLoadedStorageItem(debugModeItem))

    await waitFor(() => expect(result.current[0]).toBe(false))
  })

  it('has no value for a new item until that item has been read', async () => {
    await storage.setItem('local:debugUnlocked', true)
    const { result, rerender } = renderHook(({ item }) => useLoadedStorageItem(item), {
      initialProps: { item: debugModeItem },
    })
    await waitFor(() => expect(result.current[0]).toBe(false))

    rerender({ item: debugUnlockedItem })

    expect(result.current[0]).toBeUndefined()
    await waitFor(() => expect(result.current[0]).toBe(true))
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
      await flushMicrotasks()
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
