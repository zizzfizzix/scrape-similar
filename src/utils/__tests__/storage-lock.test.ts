import { withStorageLock } from '@/utils/storage-lock'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('withStorageLock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Extension pages and the background share the origin's lock manager, which
  // is what serialises writes across contexts; a lock held in module memory
  // would not.
  it('takes the Web Lock named after the storage key', async () => {
    const requestSpy = vi.spyOn(navigator.locks, 'request')

    await withStorageLock({ key: 'sync:user_presets' }, async () => {})

    expect(requestSpy).toHaveBeenCalledWith('sync:user_presets', expect.any(Function))
  })

  it("resolves with the task's result", async () => {
    await expect(withStorageLock({ key: 'session:result-test' }, async () => 42)).resolves.toBe(42)
  })

  it('serialises overlapping critical sections for one key', async () => {
    const order: string[] = []

    const first = withStorageLock({ key: 'session:serialisation-test' }, async () => {
      order.push('first:start')
      await Promise.resolve()
      order.push('first:end')
    })
    const second = withStorageLock({ key: 'session:serialisation-test' }, async () => {
      order.push('second:start')
      order.push('second:end')
    })

    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('lets different keys run concurrently', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withStorageLock({ key: 'session:key-a' }, async () => {
      order.push('a:start')
      await gate
      order.push('a:end')
    })
    const second = withStorageLock({ key: 'session:key-b' }, async () => {
      order.push('b:done')
    })

    await second
    releaseFirst()
    await first

    expect(order).toEqual(['a:start', 'b:done', 'a:end'])
  })

  it('releases the lock after a critical section throws', async () => {
    await expect(
      withStorageLock({ key: 'session:throwing-test' }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await expect(
      withStorageLock({ key: 'session:throwing-test' }, async () => 'recovered'),
    ).resolves.toBe('recovered')
  })
})
