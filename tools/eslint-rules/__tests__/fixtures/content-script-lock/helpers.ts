import { withLock } from './lock'

export const saveThing = (): Promise<void> => withLock('key', async () => {})

// Takes the lock only when `isContentScript` is false; listed as a boundary in the tests.
export const route = (isContentScript: boolean): Promise<void> =>
  isContentScript ? Promise.resolve() : saveThing()

export const viaRoute = (): Promise<void> => route(true)

export const pure = (n: number): number => n + 1

export const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
export const pong = (n: number): number => ping(n)

// `inCycle` reaches the lock only through `enterCycle`, which is still being
// walked when `inCycle` is reached from it.
export const enterCycle = (n: number): number => {
  const next = n > 0 ? inCycle(n - 1) : 0
  saveThing().catch(() => {})
  return next
}
export const inCycle = (n: number): number => enterCycle(n)

export type Save = () => Promise<void>
export const typedSave: Save = () => saveThing()

export const actions = { saveThing }

export const destructured = (): Promise<LockManagerSnapshot> => {
  const { locks } = navigator
  return locks.query()
}

export const indexed = (): Promise<LockManagerSnapshot> => navigator['locks'].query()
