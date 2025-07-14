// Analytics utility for tracking events with environment property
// Can be used in background scripts, content scripts, and UI contexts

import { EXTENSION_CONTEXTS, getCurrentContext } from '@/core/context-detection'
import { getCachedEnvironment } from '@/core/environment'
import { getPostHogBackground } from '@/core/posthog-background'
import { MESSAGE_TYPES } from '@/core/types'
import log from 'loglevel'

export const ANALYTICS_EVENTS = {
  // Preset operations
  PRESET_LOAD: 'preset_load',
  PRESET_SAVE: 'preset_save',
  PRESET_DELETION: 'preset_deletion',
  PRESET_HIDE: 'preset_hide',
  SYSTEM_PRESETS_RESET: 'system_presets_reset',

  // Extension lifecycle
  EXTENSION_INSTALLATION: 'extension_installation',
  SIDE_PANEL_OPEN: 'side_panel_open',

  // Settings operations
  SETTINGS_OPEN: 'settings_open',
  THEME_CHANGE: 'theme_change',
  DEBUG_MODE_TOGGLE: 'debug_mode_toggle',
  HIDDEN_SETTINGS_UNLOCK: 'hidden_settings_unlock',
  KEYBOARD_SHORTCUT_COPY: 'keyboard_shortcut_copy',

  // Scraping operations
  SCRAPE_INITIATION_FROM_CONTEXT_MENU: 'scrape_initiation_from_context_menu',
  SCRAPE_BUTTON_PRESS: 'scrape_button_press',
  SCRAPE_COMPLETION: 'scrape_completion',
  ELEMENTS_HIGHLIGHT: 'elements_highlight',

  // Configuration operations
  AUTO_GENERATE_CONFIG_BUTTON_PRESS: 'auto_generate_config_button_press',
  ADD_COLUMN_BUTTON_PRESS: 'add_column_button_press',
  REMOVE_COLUMN_BUTTON_PRESS: 'remove_column_button_press',

  // Pagination operations
  PAGINATION_BUTTON_PRESS: 'pagination_button_press',

  // Export operations
  EXPORT_TO_SHEETS_TRIGGER: 'export_to_sheets_trigger',
  EXPORT_TO_SHEETS_FAILURE: 'export_to_sheets_failure',
  EXPORT_TO_CSV_TRIGGER: 'export_to_csv_trigger',
  EXPORT_TO_CSV_FAILURE: 'export_to_csv_failure',
  COPY_TO_CLIPBOARD_TRIGGER: 'copy_to_clipboard_trigger',
  COPY_TO_CLIPBOARD_FAILURE: 'copy_to_clipboard_failure',

  // External link clicks
  AUTHOR_LINK_PRESS: 'author_link_press',
  SUPPORT_ICON_PRESS: 'support_icon_press',

  // Onboarding events
  ONBOARDING_CARD_VIEW: 'onboarding_card_view',
  ONBOARDING_NEXT_BUTTON_PRESS: 'onboarding_next_button_press',
  ONBOARDING_PREVIOUS_BUTTON_PRESS: 'onboarding_previous_button_press',
  ONBOARDING_COMPLETE: 'onboarding_complete',
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
      case EXTENSION_CONTEXTS.OPTIONS:
      case EXTENSION_CONTEXTS.ONBOARDING: {
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
