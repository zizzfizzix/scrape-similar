import { describe, expect, it, vi } from 'vitest'

/**
 * The wiring is what is under test, so every collaborator is stood in for: this
 * file asserts which services start and which listeners register, not what any
 * of them then do.
 */
const wiring = vi.hoisted(() => ({
  // The three services are started, not awaited, so their stubs have to resolve
  // rather than return `undefined`.
  initializeDebugMode: vi.fn().mockResolvedValue(undefined),
  initializeAnalyticsQueue: vi.fn().mockResolvedValue(undefined),
  initializeUninstallUrl: vi.fn().mockResolvedValue(undefined),
  setupInstallListener: vi.fn(),
  setupStartupListener: vi.fn(),
  setupTabRemovedListener: vi.fn(),
  setupTabUpdatedListener: vi.fn(),
  setupActionListener: vi.fn(),
  setupContextMenuListener: vi.fn(),
  setupCommandsListener: vi.fn(),
  setupMessageListener: vi.fn(),
}))

vi.mock('@/entrypoints/background/services/debug-mode', () => ({
  initializeDebugMode: wiring.initializeDebugMode,
}))
vi.mock('@/entrypoints/background/services/analytics-queue', () => ({
  initializeAnalyticsQueue: wiring.initializeAnalyticsQueue,
}))
vi.mock('@/entrypoints/background/listeners/install', () => ({
  initializeUninstallUrl: wiring.initializeUninstallUrl,
  setupInstallListener: wiring.setupInstallListener,
  setupStartupListener: wiring.setupStartupListener,
}))
vi.mock('@/entrypoints/background/listeners/tabs', () => ({
  setupTabRemovedListener: wiring.setupTabRemovedListener,
  setupTabUpdatedListener: wiring.setupTabUpdatedListener,
}))
vi.mock('@/entrypoints/background/listeners/action', () => ({
  setupActionListener: wiring.setupActionListener,
}))
vi.mock('@/entrypoints/background/listeners/context-menu', () => ({
  setupContextMenuListener: wiring.setupContextMenuListener,
}))
vi.mock('@/entrypoints/background/listeners/commands', () => ({
  setupCommandsListener: wiring.setupCommandsListener,
}))
vi.mock('@/entrypoints/background/handlers/messages', () => ({
  setupMessageListener: wiring.setupMessageListener,
}))

const { startBackground } = await import('@/entrypoints/background/bootstrap')

describe('startBackground', () => {
  it('starts every service and registers every listener exactly once', () => {
    startBackground()

    for (const [name, fn] of Object.entries(wiring)) {
      expect(fn, `${name} was not called exactly once`).toHaveBeenCalledTimes(1)
    }
  })

  it('turns debug mode on before anything can log through it', () => {
    startBackground()

    expect(wiring.initializeDebugMode.mock.invocationCallOrder[0]!).toBeLessThan(
      wiring.setupMessageListener.mock.invocationCallOrder[0]!,
    )
  })

  it('registers message routing last, once its collaborators exist', () => {
    startBackground()

    const lastOther = Math.max(
      ...Object.entries(wiring)
        .filter(([name]) => name !== 'setupMessageListener')
        .map(([, fn]) => fn.mock.invocationCallOrder[0]!),
    )

    expect(wiring.setupMessageListener.mock.invocationCallOrder[0]!).toBeGreaterThan(lastOther)
  })
})
