export const withLock = (key: string, task: () => Promise<void>): Promise<void> =>
  navigator.locks.request(key, task)
