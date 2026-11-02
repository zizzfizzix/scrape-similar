import { STORAGE_LOCK_TIMEOUT_MS, withStorageLock } from '@/utils/storage-lock'
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

    expect(requestSpy).toHaveBeenCalledWith(
      'sync:user_presets',
      expect.anything(),
      expect.any(Function),
    )
    const options = requestSpy.mock.lastCall?.[1]
    expect(Object.keys(options ?? {})).toEqual(['signal'])
    expect(options?.signal).toBeInstanceOf(AbortSignal)
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

  it('gives up on a lock that is not granted in time', async () => {
    vi.useFakeTimers()
    let release = () => {}
    const held = withStorageLock(
      { key: 'session:stuck' },
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const failure = withStorageLock({ key: 'session:stuck' }, async () => 'ran').catch(
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(STORAGE_LOCK_TIMEOUT_MS)

    expect(await failure).toMatchObject({
      name: 'TimeoutError',
      message: 'Timed out waiting for session:stuck',
    })
    release()
    await held
    vi.useRealTimers()
  })

  it('clears its timeout once the lock is granted', async () => {
    vi.useFakeTimers()

    await withStorageLock({ key: 'session:quick' }, async () => {})

    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('fails with a reason where Web Locks are unavailable', async () => {
    // A script on an http:// page has no `navigator.locks`: they need a secure context.
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })

    await expect(withStorageLock({ key: 'local:event_queue' }, async () => {})).rejects.toThrow(
      'Web Locks are unavailable here, so local:event_queue cannot be locked',
    )
  })
})
