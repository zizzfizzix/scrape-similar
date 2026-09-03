import log from 'loglevel'

/**
 * Start an async task from a caller that has no way to await it.
 *
 * `void task` is the other discard `no-floating-promises` accepts, and it loses
 * the rejection — which in a service worker is a console line in a context
 * nobody has a console open on. This is that discard plus the report.
 *
 * Where the callee already logs its own failures and resolves either way, the
 * bare `void` is the more accurate spelling; this would only add a `catch` that
 * can never run, which the coverage gate then reports as dead.
 */
export const reportRejection = (task: Promise<unknown>): void => {
  task.catch((error: unknown) => {
    log.error('Unhandled rejection in an unawaited task:', error)
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
