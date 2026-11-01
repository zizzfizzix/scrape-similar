// @vitest-environment jsdom
import { useShownToast } from '@/hooks/use-shown-toast'
import { renderHook } from '@testing-library/react'
import { Activity, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

/** Render the hook inside an `<Activity>` whose mode `isShown()` decides. */
const renderInPanel = (isShown: () => boolean) =>
  renderHook(() => useShownToast(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Activity mode={isShown() ? 'visible' : 'hidden'}>{children}</Activity>
    ),
  })

beforeEach(() => {
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('useShownToast', () => {
  it('shows at once while the component is shown', () => {
    const { result } = renderInPanel(() => true)

    result.current.success('Saved', { duration: 1 })
    result.current.error('Failed')

    expect(toast.success).toHaveBeenCalledWith('Saved', { duration: 1 })
    expect(toast.error).toHaveBeenCalledWith('Failed')
  })

  it('holds a toast raised while hidden until the component is shown', () => {
    let isShown = true
    const { result, rerender } = renderInPanel(() => isShown)
    isShown = false
    rerender()

    result.current.error('Could not connect')
    expect(toast.error).not.toHaveBeenCalled()

    isShown = true
    rerender()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Could not connect')
  })
})
