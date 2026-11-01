// jsdom has no `navigator.locks`. This is the part of `LockManager` the
// extension uses: exclusive locks, granted per name in request order, released
// when the callback settles, and a `signal` that abandons a request still
// waiting for its lock. One instance stands in for the lock manager every
// extension context shares.
export const createLockManager = (): LockManager => {
  const tails = new Map<string, Promise<unknown>>()

  const request = <T>(
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => T),
    maybeCallback?: (lock: Lock | null) => T,
  ): Promise<Awaited<T>> => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!
    const { signal } = options
    const previous = tails.get(name) ?? Promise.resolve()
    const lock = { name, mode: 'exclusive' } as Lock

    const granted = new Promise<void>((resolve, reject) => {
      if (signal?.aborted) reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      previous.then(() => resolve(), resolve)
    })
    // An abort after the grant settles nothing, as in the real API.
    const result = granted.then(() => callback(lock)) as Promise<Awaited<T>>
    // The next request waits for this one to release, or for the lock before it
    // when this one was abandoned.
    tails.set(name, Promise.all([previous.catch(() => undefined), result.catch(() => undefined)]))
    return result
  }

  return { request } as unknown as LockManager
}
