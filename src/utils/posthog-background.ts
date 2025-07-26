// PostHog initialization for background service workers and non-React contexts
// This allows tracking events directly from the background script without message passing

import log from 'loglevel'

// Import PostHog core library for service workers
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import 'posthog-js/dist/exception-autocapture.js'
import { PostHog } from 'posthog-js/dist/module.no-external'
import 'posthog-js/dist/tracing-headers.js'

let posthogInstance: PostHog | null = null
let initializationPromise: Promise<PostHog | null> | null = null

/**
 * Reset PostHog instance - used when consent is revoked
 */
export const resetPostHogInstance = () => {
  posthogInstance = null
  initializationPromise = null // Also reset initialization promise
  log.debug('PostHog background instance reset due to consent revocation')
}

/**
 * Get PostHog instance for background service worker context with proper error handling and race condition protection
 * Returns existing instance if already initialized, otherwise creates and returns new instance
 * Returns null if initialization fails or environment variables are missing
 */
export const getPostHogBackground = async (): Promise<PostHog | null> => {
  // Return existing instance if already initialized
  if (posthogInstance) {
    return posthogInstance
  }

  // If already initializing, return the same promise to prevent concurrent initialization
  if (initializationPromise) {
    return initializationPromise
  }

  // Start initialization
  initializationPromise = (async (): Promise<PostHog | null> => {
    // Respect user consent
    const consentState = await getConsentState()
    if (consentState !== true) {
      log.debug('User has not given consent – PostHog will not be initialized (background).')
      return null
    }

    try {
      // Get environment variables (these should be available in service worker context)
      // In Vite builds, these are replaced at build time
      const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
      const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

      if (!apiKey) {
        log.warn('PostHog API key not found in environment variables for background script')
        return null
      }

      if (!apiHost) {
        log.warn('PostHog API host not found in environment variables for background script')
        return null
      }

      log.debug('Initializing PostHog in background context...')

      // Retrieve or generate the device ID from shared storage **before** initializing PostHog
      const distinctId: DistinctId = await getOrCreateDistinctId()

      // Initialize PostHog instance
      const posthogInstance = new PostHog()
      posthogInstance.init(apiKey, {
        // Supply our own distinct_id to ensure consistent distinct_id across extension contexts
        bootstrap: {
          distinctID: distinctId.toString(),
        },
        api_host: apiHost,
        persistence: 'localStorage',
        // Not applicable in service worker
        disable_session_recording: true,
        disable_surveys: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_dead_clicks: false,
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
      return null
    }
  })()

  try {
    posthogInstance = await initializationPromise
    return posthogInstance
  } finally {
    // Clear the promise after completion (success or failure)
    initializationPromise = null
  }
}
