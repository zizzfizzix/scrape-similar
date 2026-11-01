/**
 * Give an unawaited handler its turn.
 *
 * `reportRejection` and `reportingListener` hand their promise to nobody, which
 * is the point — but it also means triggering a listener gives a test nothing
 * to await. A macrotask turn runs only after the microtask queue has drained,
 * and every `await` in a handler whose collaborators are all resolved mocks is
 * a microtask. Timers are not advanced, so a handler that waits on a real one
 * needs `vi.waitFor` instead.
 */
export const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
