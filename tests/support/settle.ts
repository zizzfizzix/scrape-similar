import { act, render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Flush the React work a mount or a storage write leaves pending.
 *
 * `render` is synchronous, so a component that reads storage in an effect has
 * not read it by the time the first assertion runs; the same goes for the
 * effects a storage watcher fires. An empty `act` gives React the turn it needs
 * to run them and commit what they set.
 *
 * This is the one `act` in the suite that `no-unnecessary-act` cannot judge —
 * to the rule an empty callback is always pointless, and it has no way to see
 * that the point is the flush rather than the callback. Every other `act` the
 * rule reports is the thing CLAUDE.md is against (wrapping `user-event` or
 * `fireEvent`, which wrap themselves), which is why the disable is one line
 * here instead of an option or a rule that is off.
 */
export const settleEffects = async (): Promise<void> => {
  // eslint-disable-next-line testing-library/no-unnecessary-act -- the empty callback is the flush; see above.
  await act(async () => {})
}

/**
 * Mount `ui` and settle it, for the components that read storage on mount.
 *
 * This is Testing Library's own `render` plus the flush above, not a stand-in
 * for it: the result is the `RenderResult` its queries and `unmount` come from.
 * Each suite still writes the `render` helper that knows which providers its
 * component needs, and calls this to do the mounting.
 */
export const renderSettled = async (ui: ReactNode): Promise<RenderResult> => {
  const view = render(ui)
  await settleEffects()
  return view
}
