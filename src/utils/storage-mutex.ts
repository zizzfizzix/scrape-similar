import { Mutex } from 'async-mutex'

// One Mutex per storage key (e.g. 'session:sidepanel_config_<tabId>', 'local:event_queue'),
// for read-modify-write cycles on that key. The map lives in JS memory, so it only
// serialises callers within one extension context; background, side panel and content
// scripts each have their own.
const mutexMap = new Map<string, Mutex>()

export const getStorageMutex = (key: string): Mutex => {
  let mutex = mutexMap.get(key)
  if (!mutex) {
    mutex = new Mutex()
    mutexMap.set(key, mutex)
  }
  return mutex
}

/**
 * Drops the mutex for a key that is no longer in use. A held mutex is kept: a
 * caller arriving after the delete would get a fresh one and run alongside the
 * holder.
 */
export const forgetStorageMutex = (key: string): void => {
  if (!mutexMap.get(key)?.isLocked()) mutexMap.delete(key)
}
