/**
 * Background service worker entry point
 *
 * This file orchestrates the background service worker by:
 * - Initializing log level and debug mode
 * - Setting up all event listeners (install, tabs, context menu, etc.)
 * - Configuring message routing between content scripts and UI
 * - Managing analytics queue and consent
 */

import log from 'loglevel'
import { setupMessageListener } from './handlers/messages'
import { setupActionListener } from './listeners/action'
import { setupCommandsListener } from './listeners/commands'
import { setupContextMenuListener } from './listeners/context-menu'
import { setupInstallListener, setupStartupListener } from './listeners/install'
import { setupTabRemovedListener, setupTabUpdatedListener } from './listeners/tabs'
import { initializeAnalyticsQueue } from './services/analytics-queue'
import { initializeDebugMode } from './services/debug-mode'

// Set default log level
log.setDefaultLevel('error')

export default defineBackground(() => {
  // Initialize debug mode and set up watchers
  initializeDebugMode()

  // Initialize analytics queue and consent watchers
  initializeAnalyticsQueue()

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
