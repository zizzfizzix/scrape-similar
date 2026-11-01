import log from 'loglevel'

/**
 * Start an async task from a caller that has no way to await it, and log what
 * it rejects with. A bare `void task` would drop the rejection, which in a
 * service worker means nobody sees it; the lint config rejects `void` on a
 * promise for that reason.
 */
export const reportRejection = (task: Promise<unknown>): void => {
  task.catch((error: unknown) => {
    log.error('Unawaited task failed:', error)
  })
}

/**
 * The same, shaped for a callback position that ignores what it is handed back:
 * `browser.*.addListener`, `storage.watch`, `addEventListener`. Passing an
 * `async` function straight to one of those is what `no-misused-promises`
 * flags, and losing the rejection is why.
 */
export const reportingListener =
  <A extends unknown[]>(handler: (...args: A) => Promise<unknown>) =>
  (...args: A): void => {
    reportRejection(handler(...args))
  }
