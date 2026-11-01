// jsdom has no `navigator.locks`. This is the part of `LockManager` the
// extension uses: exclusive locks, granted per name in request order, released
// when the callback settles. One instance per test process stands in for the
// lock manager every extension context shares.
export const createLockManager = (): LockManager => {
  const tails = new Map<string, Promise<unknown>>()

  const request = <T>(name: string, callback: (lock: Lock | null) => T): Promise<Awaited<T>> => {
    const previous = tails.get(name) ?? Promise.resolve()
    const lock = { name, mode: 'exclusive' } as Lock
    const result = previous.then(() => callback(lock)) as Promise<Awaited<T>>
    tails.set(
      name,
      result.catch(() => undefined),
    )
    return result
  }

  return { request } as unknown as LockManager
}
