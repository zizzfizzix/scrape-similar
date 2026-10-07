import { subscribeWithBackfill } from '@/utils/storage-subscription'
import { useEffect, useState } from 'react'

/**
 * The current value of a storage item, kept in step with every write to it.
 *
 * Writers call the returned setter (the item's own `setValue`) and let the
 * watch deliver the new value, so storage stays the only source of truth: a
 * write from another page lands the same way as one from this page. A removed
 * key arrives as the item's fallback, so it resets to its default.
 */
export const useStorageItem = <T>(
  item: WxtStorageItem<T, Record<string, unknown>>,
): [T, (value: T) => Promise<void>] => {
  const [value, setValue] = useState<T>(item.fallback)

  useEffect(
    () => subscribeWithBackfill<T>({ watch: item.watch, read: item.getValue }, setValue),
    [item],
  )

  return [value, item.setValue]
}
