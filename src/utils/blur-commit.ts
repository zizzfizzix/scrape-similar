/**
 * Defer before a blur commits the main selector, so a press on a suggestion or
 * button can cancel it. Kept in a module of its own so the E2E specs can import
 * it without loading `ConfigForm`.
 */
export const BLUR_COMMIT_DELAY_MS = 150
