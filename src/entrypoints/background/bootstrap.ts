import { setupMessageListener } from '@/entrypoints/background/handlers/messages'
import { setupActionListener } from '@/entrypoints/background/listeners/action'
import { setupCommandsListener } from '@/entrypoints/background/listeners/commands'
import { setupContextMenuListener } from '@/entrypoints/background/listeners/context-menu'
import {
  initializeUninstallUrl,
  setupInstallListener,
  setupStartupListener,
} from '@/entrypoints/background/listeners/install'
import {
  setupTabRemovedListener,
  setupTabUpdatedListener,
} from '@/entrypoints/background/listeners/tabs'
import { initializeAnalyticsQueue } from '@/entrypoints/background/services/analytics-queue'
import { initializeDebugMode } from '@/entrypoints/background/services/debug-mode'
import { fireAndForget } from '@/utils/fire-and-forget'

/**
 * What the background service worker wires up on startup.
 *
 * Split out of `index.ts` so the orchestration — which services start, which
 * listeners are registered, and in what order — can be exercised without the
 * `defineBackground` wrapper, which needs a real extension context.
 */
export const startBackground = (): void => {
  // Debug mode first, so everything below logs at the level the user chose.
  // None of the three can be awaited from a synchronous entrypoint, and a
  // service worker that fails to start one of them should say so.
  fireAndForget(initializeDebugMode())
  fireAndForget(initializeAnalyticsQueue())
  fireAndForget(initializeUninstallUrl())

  setupInstallListener()
  setupStartupListener()
  setupTabRemovedListener()
  setupTabUpdatedListener()
  setupActionListener()
  setupContextMenuListener()
  setupCommandsListener()

  // Last, so every handler it routes to is registered.
  setupMessageListener()
}
