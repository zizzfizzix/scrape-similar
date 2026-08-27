import { getStorageMutex } from '@/utils/session-mutex'
import { describe, expect, it } from 'vitest'

describe('getStorageMutex', () => {
  it('returns the same mutex for the same key', () => {
    expect(getStorageMutex('session:sidepanel_config_1')).toBe(
      getStorageMutex('session:sidepanel_config_1'),
    )
  })

  it('returns a distinct mutex per key', () => {
    expect(getStorageMutex('session:sidepanel_config_1')).not.toBe(
      getStorageMutex('session:sidepanel_config_2'),
    )
  })

  it('serialises overlapping critical sections for one key', async () => {
    const mutex = getStorageMutex('session:serialisation-test')
    const order: string[] = []

    const first = mutex.runExclusive(async () => {
      order.push('first:start')
      await Promise.resolve()
      order.push('first:end')
    })
    const second = mutex.runExclusive(async () => {
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

    const first = getStorageMutex('session:key-a').runExclusive(async () => {
      order.push('a:start')
      await gate
      order.push('a:end')
    })
    const second = getStorageMutex('session:key-b').runExclusive(async () => {
      order.push('b:done')
    })

    await second
    releaseFirst()
    await first

    expect(order).toEqual(['a:start', 'b:done', 'a:end'])
  })

  it('releases the lock after a critical section throws', async () => {
    const mutex = getStorageMutex('session:throwing-test')

    await expect(
      mutex.runExclusive(() => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await expect(mutex.runExclusive(async () => 'recovered')).resolves.toBe('recovered')
  })
})
