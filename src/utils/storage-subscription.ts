import { reportRejection } from '@/utils/report-rejection'

export interface StorageSubscriptionSource<T> {
  /** Must register the listener synchronously; returns its unsubscribe. */
  watch: (onChange: (value: T | null) => void) => () => void
  read: () => Promise<T | null>
}

/**
 * Subscribe to a storage key and backfill whatever it already holds.
 *
 * Reading a key before subscribing to it loses every write that lands in
 * between: the read has happened and the listener does not exist yet. Doing it
 * the other way round closes that gap - the listener covers everything written
 * from now on, the read everything written before it - which matters wherever
 * another context can write the value while the reader is still starting up.
 *
 * A value the listener has already delivered is newer than the backfill read,
 * so it wins even if the read resolves later.
 *
 * `onCaughtUp` runs once the backfill read has resolved, whether or not it
 * found a value, unless the subscription has been dropped by then.
 */
export const subscribeWithBackfill = <T>(
  { watch, read }: StorageSubscriptionSource<T>,
  onValue: (value: T) => void,
  onCaughtUp?: () => void,
): (() => void) => {
  let isSubscribed = true
  let hasWatchedValue = false

  const unwatch = watch((value) => {
    if (!isSubscribed || value == null) return
    hasWatchedValue = true
    onValue(value)
  })

  reportRejection(
    read().then((value) => {
      if (!isSubscribed) return
      if (!hasWatchedValue && value != null) onValue(value)
      onCaughtUp?.()
    }),
  )

  return () => {
    isSubscribed = false
    unwatch()
  }
}
