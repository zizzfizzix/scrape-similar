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
export const withStorageLock = <T>(item: { key: string }, task: () => Promise<T>): Promise<T> =>
  navigator.locks.request(item.key, task)
