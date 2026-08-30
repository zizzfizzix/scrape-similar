import { asListener, fireAndForget } from '@/utils/fire-and-forget'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('fireAndForget', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a rejection instead of leaving it unhandled', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('task blew up')

    expect(fireAndForget(Promise.reject(failure))).toBeUndefined()

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'Unhandled rejection in a fire-and-forget task:',
        failure,
      ),
    )
  })

  it('says nothing about a task that resolves', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})

    fireAndForget(Promise.resolve('ignored'))

    await Promise.resolve()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('asListener', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes every argument through and returns nothing', () => {
    const handler = vi.fn(async (_a: number, _b: string) => 'ignored')

    expect(asListener(handler)(7, 'seven')).toBeUndefined()
    expect(handler).toHaveBeenCalledWith(7, 'seven')
  })

  it('reports a rejection from the handler', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('listener blew up')

    asListener(async () => {
      throw failure
    })()

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'Unhandled rejection in a fire-and-forget task:',
        failure,
      ),
    )
  })
})
