import { useStorageItem } from '@/hooks/use-storage-item'
import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'
import { useEffect } from 'react'

/**
 * The persisted debug-mode flag, with this page's log level following it:
 * `trace` while it is on, `error` while it is off, and always `trace` in a
 * development or test build.
 */
export const useDebugMode = (): [boolean, (isEnabled: boolean) => Promise<void>] => {
  const [isDebugModeEnabled, setDebugModeEnabled] = useStorageItem(debugModeItem)

  const logLevel = isDevOrTest || isDebugModeEnabled ? 'trace' : 'error'
  useEffect(() => {
    log.setLevel(logLevel)
  }, [logLevel])

  return [isDebugModeEnabled, setDebugModeEnabled]
}
