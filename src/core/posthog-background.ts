// PostHog initialization for background service workers and non-React contexts
// This allows tracking events directly from the background script without message passing

import log from 'loglevel'

// Import PostHog core library for service workers
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import { DeviceId, getOrCreateDeviceId } from '@/core/device-id'
import 'posthog-js/dist/exception-autocapture.js'
import { PostHog } from 'posthog-js/dist/module.no-external'
import 'posthog-js/dist/tracing-headers.js'

let posthogInstance: PostHog | null = null

/**
 * Get PostHog instance for background service worker context
 * Returns existing instance if already initialized, otherwise creates and returns new instance
 * Returns null if initialization fails or environment variables are missing
 */
export const getPostHogBackground = async (): Promise<PostHog | null> => {
  // Return existing instance if already initialized
  if (posthogInstance) {
    return posthogInstance
  }

  try {
    // Get environment variables (these should be available in service worker context)
    // In Vite builds, these are replaced at build time
    const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

    if (!apiKey || !apiHost) {
      log.warn('PostHog API key or host not found in environment variables for background script')
      return null
    }

    log.debug('Initializing PostHog in background context...')

    // Retrieve or generate the device ID from shared storage **before** initializing PostHog
    const deviceId: DeviceId = await getOrCreateDeviceId()

    // Initialize PostHog instance
    posthogInstance = new PostHog()
    posthogInstance.init(apiKey, {
      // Supply our own device_id to ensure consistent device_id across extensioncontexts
      get_device_id: (_uuid: string) => deviceId.toString(),
      api_host: apiHost,
      // Service worker specific options
      persistence: 'localStorage', // Use memory persistence in service worker to avoid cookie consent
      disable_session_recording: true, // Not applicable in service worker
      disable_surveys: true, // Not applicable in service worker
      autocapture: false, // Manual tracking only
      capture_pageview: false, // Not applicable in service worker
      capture_pageleave: false, // Not applicable in service worker
      capture_dead_clicks: false, // Not applicable in service worker
      property_denylist: [
        '$current_url',
        '$referrer',
        '$pathname',
        '$prev_pageview_pathname',
        '$session_entry_url',
        '$session_entry_pathname',
        '$session_entry_referrer',
      ],
    })

    log.debug('PostHog background service worker initialized successfully')
    return posthogInstance
  } catch (error) {
    log.error('Failed to initialize PostHog in background:', error)
    // Reset instance so we can try again later
    posthogInstance = null
    return null
  }
}
