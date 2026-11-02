import { subscribeWithBackfill } from '@/utils/storage-subscription'
import { useCallback, useEffect, useState } from 'react'

type Item<T> = WxtStorageItem<T, Record<string, unknown>>

/**
 * The item's value once the hook has one, or `null` before that. The value is
 * stored with the item it came from, so switching to another item reads as
 * not loaded until that item's own value arrives.
 */
const useSubscribedValue = <T extends NonNullable<unknown>>(
  item: Item<T>,
  shouldSettleUnset: boolean,
): { value: T } | null => {
  const [loaded, setLoaded] = useState<{ item: Item<T>; value: T } | null>(null)

  useEffect(() => {
    // Without `shouldSettleUnset`, an unset key reads back as the fallback the
    // caller already shows, so the read only reports a value that was actually
    // stored. Otherwise every mount would schedule a render that changes
    // nothing, after a caller that does not wait for storage may already have
    // torn its page down.
    const readStored = async () => {
      const stored = await item.getValue()
      return !shouldSettleUnset && Object.is(stored, item.fallback) ? null : stored
    }
    // A failed read still settles on the fallback, so a caller waiting for the
    // value is not held forever.
    const settleOnFallback = () =>
      setLoaded((previous) => (previous?.item === item ? previous : { item, value: item.fallback }))
    return subscribeWithBackfill<T>(
      { watch: (callback) => item.watch(callback), read: readStored },
      (value) => setLoaded({ item, value }),
      shouldSettleUnset ? settleOnFallback : undefined,
    )
  }, [item, shouldSettleUnset])

  return loaded?.item === item ? loaded : null
}

/** The item's `setValue`, with an identity that changes only with the item. */
const useSetter = <T extends NonNullable<unknown>>(item: Item<T>) =>
  useCallback((value: T) => item.setValue(value), [item])

/**
 * The current value of a storage item, kept in step with every write to it.
 *
 * Writers call the returned setter (the item's `setValue`) and let the
 * watch deliver the new value, so storage stays the only source of truth: a
 * write from another page lands the same way as one from this page. A removed
 * key arrives as the item's fallback, so it resets to its default.
 *
 * Until the stored value has been read, this returns the fallback; use
 * `useLoadedStorageItem` where showing the fallback first is visible.
 *
 * Only items with a non-null fallback are accepted: an item without one
 * delivers a removed key as `null`, which the subscription skips, so the hook
 * would keep showing the removed value.
 */
export const useStorageItem = <T extends NonNullable<unknown>>(
  item: Item<T>,
): [T, (value: T) => Promise<void>] => {
  const loaded = useSubscribedValue(item, false)
  return [loaded ? loaded.value : item.fallback, useSetter(item)]
}

/**
 * `useStorageItem`, but `undefined` until the stored value has been read, so
 * the caller can hold back what it would otherwise render from the fallback.
 * Settling an unset key costs one extra render on mount.
 */
export const useLoadedStorageItem = <T extends NonNullable<unknown>>(
  item: Item<T>,
): [T | undefined, (value: T) => Promise<void>] => {
  const loaded = useSubscribedValue(item, true)
  return [loaded?.value, useSetter(item)]
}
