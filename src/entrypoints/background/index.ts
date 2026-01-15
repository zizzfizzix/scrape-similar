/**
 * Background service worker entry point
 *
 * This file orchestrates the background service worker by:
 * - Initializing log level and debug mode
 * - Setting up all event listeners (install, tabs, context menu, etc.)
 * - Configuring message routing between content scripts and UI
 * - Managing analytics queue and consent
 */

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
import log from 'loglevel'

// Set default log level
log.setDefaultLevel('error')

export default defineBackground(() => {
  // Initialize debug mode and set up watchers
  initializeDebugMode()

  // Initialize analytics queue and consent watchers
  initializeAnalyticsQueue()

  // Initialize uninstall URL and watcher
  initializeUninstallUrl()

  // Set up event listeners
  setupInstallListener()
  setupStartupListener()
  setupTabRemovedListener()
  setupTabUpdatedListener()
  setupActionListener()
  setupContextMenuListener()
  setupCommandsListener()

  // Set up message routing
  setupMessageListener()
})
