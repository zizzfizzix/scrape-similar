import log from 'loglevel'

/**
 * Start an async task from a caller that has no way to await it, and report the
 * rejection rather than dropping it.
 *
 * A promise nobody holds is not automatically a mistake — a service worker
 * starting its watchers, or an event listener doing its work, has no one to
 * hand a promise to. What is a mistake is losing the rejection: an unhandled
 * one is a console line in a context nobody has a console open on. This is the
 * discard `no-floating-promises` asks for, plus the report that makes it worth
 * writing.
 *
 * Where the callee already logs its own failures and resolves either way, a
 * bare `void` says so more accurately — this wrapper would only add a `catch`
 * that can never run.
 */
export const fireAndForget = (task: Promise<unknown>): void => {
  task.catch((error: unknown) => {
    log.error('Unhandled rejection in a fire-and-forget task:', error)
  })
}

/**
 * The same thing for a callback position that ignores what it is handed back:
 * `browser.*.addListener`, `storage.watch`, `addEventListener`. Passing an
 * `async` function straight to one of those is what `no-misused-promises`
 * flags, and losing the rejection is why.
 */
export const asListener =
  <A extends unknown[]>(handler: (...args: A) => Promise<unknown>) =>
  (...args: A): void => {
    fireAndForget(handler(...args))
  }
