import type React from 'react'

/**
 * Whether a keydown belongs to an IME composition (choosing a candidate in a
 * Japanese, Chinese or Korean input method), so the field must leave it to the IME.
 *
 * Safari fires the keydown for the Enter that confirms a candidate after
 * `compositionend`, with `isComposing` already false; `keyCode` 229 is the only
 * signal left on that event.
 */
export const isImeComposing = (event: React.KeyboardEvent): boolean =>
  event.nativeEvent.isComposing ||
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- no standard property reports Safari's post-composition keydown
  event.keyCode === 229
