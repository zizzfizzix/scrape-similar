// Analytics utility for tracking events with environment property
// Can be used in background scripts, content scripts, and UI contexts

import log from 'loglevel'
import { EXTENSION_CONTEXTS, getCurrentContext } from './context-detection'
import { getCachedEnvironment } from './environment'
import { getPostHogBackground } from './posthog-background'
import { MESSAGE_TYPES } from './types'

export const ANALYTICS_EVENTS = {
  // Preset operations
  PRESET_LOADED: 'preset_loaded',
  PRESET_SAVED: 'preset_saved',
  PRESET_DELETED: 'preset_deleted',
  PRESET_HIDDEN: 'preset_hidden',
  SYSTEM_PRESETS_RESET: 'system_presets_reset',

  // Extension lifecycle
  EXTENSION_INSTALLED: 'extension_installed',
  SIDE_PANEL_OPENED: 'side_panel_opened',

  // Settings operations
  SETTINGS_OPENED: 'settings_opened',
  THEME_CHANGED: 'theme_changed',
  DEBUG_MODE_TOGGLED: 'debug_mode_toggled',
  HIDDEN_SETTINGS_UNLOCKED: 'hidden_settings_unlocked',
  KEYBOARD_SHORTCUT_COPIED: 'keyboard_shortcut_copied',

  // Scraping operations
  SCRAPE_INITIATED_FROM_CONTEXT_MENU: 'scrape_initiated_from_context_menu',
  SCRAPE_BUTTON_PRESSED: 'scrape_button_pressed',
  SCRAPE_COMPLETED: 'scrape_completed',
  ELEMENTS_HIGHLIGHTED: 'elements_highlighted',

  // Configuration operations
  AUTO_GENERATE_CONFIG_BUTTON_PRESSED: 'auto_generate_config_button_pressed',
  ADD_COLUMN_BUTTON_PRESSED: 'add_column_button_pressed',
  REMOVE_COLUMN_BUTTON_PRESSED: 'remove_column_button_pressed',

  // Pagination operations
  PAGINATION_BUTTON_PRESSED: 'pagination_button_pressed',

  // Export operations
  EXPORT_TO_SHEETS: 'export_to_sheets',
  EXPORT_TO_SHEETS_FAILED: 'export_to_sheets_failed',
  EXPORT_TO_CSV: 'export_to_csv',
  EXPORT_TO_CSV_FAILED: 'export_to_csv_failed',
  COPY_TO_CLIPBOARD: 'copy_to_clipboard',
  COPY_TO_CLIPBOARD_FAILED: 'copy_to_clipboard_failed',
} as const

/**
 * Track an event with PostHog, automatically including the environment property
 * This function handles all three execution contexts with proper context detection:
 * - Background service worker: Uses getPostHogBackground()
 * - React UI context: Uses PostHog from React context (via window.__scrape_similar_posthog)
 * - Content script: Sends message to background script for tracking
 */
export const trackEvent = async (eventName: string, properties: Record<string, any> = {}) => {
  try {
    const context = getCurrentContext()
    const environment = await getCachedEnvironment()

    // Add environment and context properties to all events
    const eventProperties = {
      ...properties,
      ...(environment && { environment }),
      // Don't override extension_context if it's already set e.g. from content script
      extension_context: properties.extension_context || context,
    }

    log.debug(`Tracking event in ${context} context: ${eventName}`, eventProperties)

    switch (context) {
      case EXTENSION_CONTEXTS.BACKGROUND: {
        const backgroundPostHog = await getPostHogBackground()
        if (backgroundPostHog) {
          backgroundPostHog.capture(eventName, eventProperties)
          log.debug(`Tracked event (background context): ${eventName}`, eventProperties)
        } else {
          log.warn('PostHog not available in background context')
        }
        break
      }

      case EXTENSION_CONTEXTS.SIDEPANEL:
      case EXTENSION_CONTEXTS.POPUP:
      case EXTENSION_CONTEXTS.OPTIONS: {
        if ((window as any).__scrape_similar_posthog) {
          ;(window as any).__scrape_similar_posthog.capture(eventName, eventProperties)
          log.debug(`Tracked event (UI context): ${eventName}`, eventProperties)
        } else {
          log.warn('PostHog not available in UI context - may not be initialized yet')
        }
        break
      }

      case EXTENSION_CONTEXTS.CONTENT_SCRIPT: {
        try {
          chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.TRACK_EVENT,
            payload: {
              eventName,
              properties: eventProperties,
            },
          })
          log.debug(`Tracked event (content script context): ${eventName}`, eventProperties)
        } catch (error) {
          log.debug('Failed to send tracking message from content script:', error)
        }
        break
      }

      default: {
        log.warn(`Unknown context for tracking event: ${context}`, {
          eventName,
          properties: eventProperties,
          context,
          hasWindow: typeof window !== 'undefined',
          hasChrome: typeof chrome !== 'undefined',
          url: typeof window !== 'undefined' ? window.location?.href : 'N/A',
        })
        break
      }
    }
  } catch (error) {
    log.error('Error tracking event:', error)
  }
}
