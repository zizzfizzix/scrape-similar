import { reportingListener, reportRejection } from '@/utils/report-rejection'
import log from 'loglevel'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

describe('reportRejection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a rejection instead of leaving it unhandled', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('task blew up')

    expectTypeOf(reportRejection).returns.toBeVoid()
    reportRejection(Promise.reject(failure))

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Unawaited task failed:', failure))
  })

  it('says nothing about a task that resolves', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})

    reportRejection(Promise.resolve('ignored'))

    await Promise.resolve()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('reportingListener', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('passes every argument through and returns nothing', () => {
    const handler = vi.fn(async (_a: number, _b: string) => 'ignored')

    const listener = reportingListener(handler)
    expectTypeOf(listener).returns.toBeVoid()
    listener(7, 'seven')
    expect(handler).toHaveBeenCalledWith(7, 'seven')
  })

  it('reports a rejection from the handler', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('listener blew up')

    reportingListener(async () => {
      throw failure
    })()

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Unawaited task failed:', failure))
  })
})
