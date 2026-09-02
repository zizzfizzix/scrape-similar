import log from 'loglevel'

/**
 * Start an async task from a caller that has no way to await it, and report the
 * rejection rather than dropping it.
 *
 * A promise nobody holds is not automatically a mistake — a service worker
 * starting its watchers, a click handler, or the message router that has to
 * return `true` before its dispatcher finishes has no one to hand a promise to.
 * What is a mistake is losing the rejection, which in a service worker is a
 * console line in a context nobody has a console open on. `void task` is the
 * discard `no-floating-promises` accepts; this is the discard plus the report.
 *
 * Where the callee already logs its own failures and resolves either way, a
 * bare `void` says so more accurately — this would only add a `catch` that can
 * never run.
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
