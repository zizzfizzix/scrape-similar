import type { Mock } from 'vitest'

/**
 * How many times `trackEvent` sent `eventName`, whatever its properties.
 * `not.toHaveBeenCalledWith(name, expect.anything())` misses a call made
 * without properties, and `toHaveBeenCalledWith` passes on duplicates.
 */
export const countTrackedEvents = (trackEvent: Mock, eventName: string): number =>
  trackEvent.mock.calls.filter(([name]) => name === eventName).length
