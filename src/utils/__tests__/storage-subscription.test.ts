import { subscribeWithBackfill } from '@/utils/storage-subscription'
import { describe, expect, it, vi } from 'vitest'

interface StoredValue {
  label: string
}

/**
 * Stand-in for one storage key whose read resolution and change notifications
 * the test drives by hand, so the orderings `subscribeWithBackfill` has to
 * survive can be reproduced exactly.
 */
const makeSource = () => {
  let notify: ((value: StoredValue | null) => void) | undefined
  let resolveRead: ((value: StoredValue | null) => void) | undefined
  const unwatch = vi.fn()
  const setupOrder: Array<'watch' | 'read'> = []

  return {
    source: {
      watch: (onChange: (value: StoredValue | null) => void) => {
        setupOrder.push('watch')
        notify = onChange
        return unwatch
      },
      read: () => {
        setupOrder.push('read')
        return new Promise<StoredValue | null>((resolve) => {
          resolveRead = resolve
        })
      },
    },
    setupOrder,
    write: (value: StoredValue | null) => notify?.(value),
    finishRead: async (value: StoredValue | null) => {
      resolveRead?.(value)
      // Let the subscription's continuation on that read run.
      await vi.waitFor(() => {})
    },
    unwatch,
  }
}

describe('subscribeWithBackfill', () => {
  it('delivers the value the key already held', async () => {
    const { source, finishRead } = makeSource()
    const onValue = vi.fn()

    subscribeWithBackfill(source, onValue)
    await finishRead({ label: 'stored' })

    expect(onValue).toHaveBeenCalledExactlyOnceWith({ label: 'stored' })
  })

  it('subscribes before reading, leaving no gap a write can fall into', () => {
    const { source, setupOrder } = makeSource()

    subscribeWithBackfill(source, vi.fn())

    // Reading first is what the side panel used to do, across two effects.
    expect(setupOrder).toEqual(['watch', 'read'])
  })

  it('keeps a watched value even when the backfill read resolves later', async () => {
    const { source, write, finishRead } = makeSource()
    const onValue = vi.fn()

    subscribeWithBackfill(source, onValue)

    write({ label: 'written during setup' })
    expect(onValue).toHaveBeenCalledExactlyOnceWith({ label: 'written during setup' })

    // The read was issued before that write, so it can still resolve with the
    // older value.
    await finishRead({ label: 'stale' })

    expect(onValue).toHaveBeenCalledExactlyOnceWith({ label: 'written during setup' })
  })

  it('keeps delivering writes after the backfill', async () => {
    const { source, write, finishRead } = makeSource()
    const onValue = vi.fn()

    subscribeWithBackfill(source, onValue)
    await finishRead({ label: 'stored' })
    write({ label: 'first update' })
    write({ label: 'second update' })

    expect(onValue.mock.calls).toEqual([
      [{ label: 'stored' }],
      [{ label: 'first update' }],
      [{ label: 'second update' }],
    ])
  })

  it('delivers nothing for a key that holds no value', async () => {
    const { source, write, finishRead } = makeSource()
    const onValue = vi.fn()

    subscribeWithBackfill(source, onValue)
    write(null)
    await finishRead(null)

    expect(onValue).not.toHaveBeenCalled()
  })

  it('stops delivering once unsubscribed', async () => {
    const { source, write, finishRead, unwatch } = makeSource()
    const onValue = vi.fn()

    const unsubscribe = subscribeWithBackfill(source, onValue)
    unsubscribe()

    await finishRead({ label: 'stored' })
    write({ label: 'late update' })

    expect(onValue).not.toHaveBeenCalled()
    expect(unwatch).toHaveBeenCalledOnce()
  })
})
