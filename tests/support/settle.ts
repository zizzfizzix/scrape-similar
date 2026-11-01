import { act, render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Flush the React work a mount or a storage write leaves pending.
 *
 * `render` returns before a storage read started in an effect has resolved, and
 * a storage watcher's callback runs after the write that fired it. An empty
 * async `act` lets those promises settle and commits the state they set.
 */
export const settleEffects = async (): Promise<void> => {
  // eslint-disable-next-line testing-library/no-unnecessary-act -- the rule reports every empty callback; here the empty callback is the flush.
  await act(async () => {})
}

/**
 * Testing Library's `render` followed by `settleEffects`, for components that
 * read storage on mount. Each test file wraps it with the providers its
 * component needs.
 */
export const renderSettled = async (ui: ReactNode): Promise<RenderResult> => {
  const view = render(ui)
  await settleEffects()
  return view
}
