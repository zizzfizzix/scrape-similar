import { Mutex } from 'async-mutex'

// In-memory map of Mutexes keyed by storage key (e.g. 'session:sidepanel_config_<tabId>')
// This guards concurrent read-modify-write cycles *within the same extension context*.
// Note: different contexts (background, side-panel, content) do **not** share JS memory,
// so this only protects against races inside one context. Cross-context races are
// still mitigated by sequencing of user actions and by the fact that most updates
// originate from the side-panel itself.
const mutexMap = new Map<string, Mutex>()

export const getStorageMutex = (key: string): Mutex => {
  let mutex = mutexMap.get(key)
  if (!mutex) {
    mutex = new Mutex()
    mutexMap.set(key, mutex)
  }
  return mutex
}
