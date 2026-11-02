import { onTestFinished, vi } from 'vitest'

// `Navigator`'s properties are getters on its prototype, so a stand-in built
// with `{ ...navigator }` has none of them, and loses the `locks` shim too.
// These replace one property on the real object instead.

export const stubUserAgent = (userAgent: string): void => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

/** jsdom has no `navigator.clipboard`, so there is no getter to spy on. */
export const stubClipboard = (
  writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined),
): typeof writeText => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  onTestFinished(() => {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else delete (navigator as { clipboard?: Clipboard }).clipboard
  })
  return writeText
}
