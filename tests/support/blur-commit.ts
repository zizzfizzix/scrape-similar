import { BLUR_COMMIT_DELAY_MS } from '@/components/ConfigForm'
import { act } from '@testing-library/react'

/**
 * Wait past the main selector's blur-commit defer on real timers, inside `act`
 * so the commit's state updates are flushed. The margin covers timer jitter.
 */
export const outlastBlurCommit = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, BLUR_COMMIT_DELAY_MS + 50))
  })
