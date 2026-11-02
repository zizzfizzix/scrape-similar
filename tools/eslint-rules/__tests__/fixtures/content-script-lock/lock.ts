export const withLock = (key: string, task: () => Promise<void>): Promise<void> =>
  navigator.locks.request(key, task)

export const withLockOf = <T>(key: string, task: () => Promise<T>): Promise<T> =>
  navigator.locks.request(key, task)
