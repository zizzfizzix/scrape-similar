// Storage operations settle in milliseconds; a wait this long means a holder is
// stuck, and failing the write beats hanging every context that shares the key.
// Kept well under the ~30 s idle limit after which Chrome stops the service
// worker, so a waiting background write still fails and logs before then.
export const STORAGE_LOCK_TIMEOUT_MS = 10_000

/**
 * Runs `task` while holding the Web Lock named after a storage item's key (e.g.
 * 'session:sidepanel_config_<tabId>', 'local:event_queue'), for read-modify-write
 * cycles on that key. The key is read at call time, so a caller inside a
 * function does not pin the item into every bundle that imports its module.
 *
 * Web Locks are scoped to an origin within one storage partition, so the lock
 * is shared by the background and the extension pages of a profile, in all of
 * its windows. An extension page in an incognito or private window may get a
 * separate lock manager, and its writes are then not serialised against the
 * rest. A content script gets the lock manager of the page it runs in, so it
 * must not call this: it hands its storage writes to the background instead.
 *
 * The lock is not re-entrant: a task that requests the same key again waits on
 * itself forever.
 */
export const withStorageLock = async <T>(
  item: { key: string },
  task: () => Promise<T>,
): Promise<T> => {
  // Web Locks need a secure context, so a script on an http:// page has none.
  if (!(navigator.locks as LockManager | undefined)) {
    throw new Error(`Web Locks are unavailable here, so ${item.key} cannot be locked`)
  }
  // A timer of our own rather than `AbortSignal.timeout`, which would keep
  // running for the full timeout after every lock is granted.
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException(`Timed out waiting for ${item.key}`, 'TimeoutError')),
    STORAGE_LOCK_TIMEOUT_MS,
  )
  try {
    return await navigator.locks.request(item.key, { signal: controller.signal }, () => {
      clearTimeout(timer)
      return task()
    })
  } finally {
    clearTimeout(timer)
  }
}

interface UpdatableItem<T> {
  key: string
  getValue: () => Promise<T>
  setValue: (value: T) => Promise<void>
}

/**
 * Replaces an item's value with `update(current)` under its lock, and resolves
 * the value it ends up holding. A failed read rejects before anything is
 * written, so the update never runs on a stand-in for a value that could not be
 * read. An `update` that returns `current` itself writes nothing.
 *
 * `current` may be the item's shared fallback, so `update` must return a new
 * value rather than mutate it.
 */
export const updateStorageItem = <T, U extends T = T>(
  item: UpdatableItem<T>,
  update: (current: T) => U,
): Promise<U> =>
  withStorageLock(item, async () => {
    const current = await item.getValue()
    const next = update(current)
    if (!Object.is(next, current)) {
      await item.setValue(next)
    }
    return next
  })
