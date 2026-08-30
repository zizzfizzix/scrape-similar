/**
 * Let a fire-and-forget handler finish.
 *
 * `asListener` and `fireAndForget` hand their promise to nobody, which is the
 * point — but it also means triggering a listener gives a test nothing to
 * await. A macrotask turn runs after every pending microtask, and every `await`
 * in a handler whose collaborators are all resolved mocks is a microtask.
 */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
