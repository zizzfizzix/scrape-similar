import { reportingListener, reportRejection } from '@/utils/report-rejection'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('reportRejection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a rejection instead of leaving it unhandled', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('task blew up')

    expect(reportRejection(Promise.reject(failure))).toBeUndefined()

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Unhandled rejection in an unawaited task:', failure),
    )
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

    expect(reportingListener(handler)(7, 'seven')).toBeUndefined()
    expect(handler).toHaveBeenCalledWith(7, 'seven')
  })

  it('reports a rejection from the handler', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('listener blew up')

    reportingListener(async () => {
      throw failure
    })()

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Unhandled rejection in an unawaited task:', failure),
    )
  })
})
