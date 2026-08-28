/** The two storage primitives `subscribeWithBackfill` needs for one key. */
export interface StorageSubscriptionSource<T> {
  /** Registers a change listener synchronously and returns its unsubscribe. */
  watch: (onChange: (value: T | null) => void) => () => void
  /** Reads the key's current value. */
  read: () => Promise<T | null>
}

/**
 * Subscribe to a storage key and backfill whatever it already holds.
 *
 * Reading a key before subscribing to it loses every write that lands in
 * between: the read has happened and the listener does not exist yet. Doing it
 * the other way round closes that gap - the listener covers everything written
 * from now on, the read everything written before it - which matters wherever a
 * value can be written by another context while the reader is still starting up.
 *
 * A value the listener has already delivered is newer than the backfill read, so
 * it wins even if the read resolves later. Absent values are not delivered, and
 * nothing is delivered after unsubscribing.
 *
 * @returns Unsubscribe function.
 */
export const subscribeWithBackfill = <T>(
  { watch, read }: StorageSubscriptionSource<T>,
  onValue: (value: T) => void,
): (() => void) => {
  let isSubscribed = true
  let hasWatchedValue = false

  const unwatch = watch((value) => {
    if (!isSubscribed || value == null) return
    hasWatchedValue = true
    onValue(value)
  })

  read().then((value) => {
    if (isSubscribed && !hasWatchedValue && value != null) {
      onValue(value)
    }
  })

  return () => {
    isSubscribed = false
    unwatch()
  }
}
