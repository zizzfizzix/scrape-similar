import { vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

/**
 * Test-only helpers for driving `fakeBrowser`.
 *
 * Most WebExtension methods `@webext-core/fake-browser` does not implement are
 * `notImplemented` stubs, and the ones it does implement are declared with the
 * multi-overload (promise + callback) signatures of the real APIs. Neither can
 * be spied on with a plainly-typed `vi.spyOn`, so these wrappers keep the casts
 * in one place instead of at every call site.
 */

export const spyOnBrowser = <T extends object>(target: T, method: keyof T & string): MockInstance =>
  vi.spyOn(target as never, method as never) as unknown as MockInstance

/**
 * Set (or clear) `browser.runtime.lastError`, which callback-style APIs report
 * failures through. It is declared read-only on the fake.
 */
export const setLastError = (lastError: { message?: string } | undefined): void => {
  ;(fakeBrowser.runtime as { lastError?: { message?: string } }).lastError = lastError
}
