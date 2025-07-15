import log from 'loglevel'
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import { CONSENT_STORAGE_KEY, getConsentState } from '@/core/consent'
import { getOrCreateDeviceId } from '@/core/device-id'
import 'posthog-js/dist/dead-clicks-autocapture.js'
import 'posthog-js/dist/exception-autocapture.js'
import { PostHog } from 'posthog-js/dist/module.no-external'
import 'posthog-js/dist/posthog-recorder.js'
import 'posthog-js/dist/surveys.js'
import 'posthog-js/dist/tracing-headers.js'
import 'posthog-js/dist/web-vitals.js'
import React, { ReactNode, useEffect } from 'react'

interface PostHogWrapperProps {
  children: ReactNode
}

// Module-level initialization state to prevent concurrent initialization across all component instances
let initializationPromise: Promise<void> | null = null

// Helper function to check if PostHog is already initialized
const isPostHogInitialized = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    (window as any).__scrape_similar_posthog &&
    (window as any).__scrape_similar_posthog instanceof PostHog
  )
}

/**
 * Reset PostHog UI instance - used when consent is revoked
 */
export const resetPostHogUI = () => {
  initializationPromise = null
  if (isPostHogInitialized()) {
    delete (window as any).__scrape_similar_posthog
    log.debug('PostHog UI instance reset due to consent revocation')
  }
}

/**
 * Initialize PostHog instance with proper error handling and race condition protection
 */
async function initializePostHog(): Promise<void> {
  // Return existing instance if already initialized
  if (isPostHogInitialized()) {
    return
  }

  // If already initializing, return the same promise to prevent concurrent initialization
  if (initializationPromise) {
    return initializationPromise
  }

  // Start initialization
  initializationPromise = (async () => {
    const consentState = await getConsentState()
    if (consentState !== true) {
      log.debug('User has not given consent – PostHog will not be initialized (UI context).')
      return
    }

    try {
      const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
      const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

      if (!apiKey) {
        log.warn('PostHog API key not found in environment variables')
        return
      }

      if (!apiHost) {
        log.warn('PostHog API host not found in environment variables')
        return
      }

      log.debug('Initializing PostHog in UI context')

      // Retrieve or generate the device ID from shared storage **before** initializing PostHog
      const deviceId = await getOrCreateDeviceId()

      // Initialize PostHog instance
      const posthogInstance = new PostHog()
      posthogInstance.init(apiKey, {
        // Supply our own device_id to ensure consistent device_id across extension contexts
        get_device_id: (_uuid: string) => deviceId.toString(),
        api_host: apiHost,
        persistence: 'localStorage',
        // Disable external loading to be compatible with Manifest V3
        disable_external_dependency_loading: true,
        // Session replay configuration for Manifest V3
        session_recording: {
          recordCrossOriginIframes: false, // Disable for security in extensions
        },
        property_denylist: [
          '$current_url',
          '$referrer',
          '$pathname',
          '$prev_pageview_pathname',
          '$session_entry_url',
          '$session_entry_pathname',
          '$session_entry_referrer',
        ],
        loaded: (posthogInstance) => {
          // Expose PostHog instance to window for analytics utility
          // Using a custom property name to avoid conflicts with website's PostHog
          ;(window as any).__scrape_similar_posthog = posthogInstance
          log.debug('PostHog instance exposed to window.__scrape_similar_posthog')
        },
      })

      log.debug('PostHog UI context initialized successfully')
    } catch (error) {
      log.error('Failed to initialize PostHog in UI context:', error)
    }
  })()

  try {
    await initializationPromise
  } finally {
    // Clear the promise after completion (success or failure)
    initializationPromise = null
  }
}

export const PostHogWrapper: React.FC<PostHogWrapperProps> = ({ children }) => {
  useEffect(() => {
    let isMounted = true

    // Create stable function reference for consent change handler
    const handleConsentChange = (changes: any, area: string) => {
      if (area === 'local' && changes[CONSENT_STORAGE_KEY]) {
        if (changes[CONSENT_STORAGE_KEY].newValue === true) {
          // Only initialize if not already initialized
          if (!isPostHogInitialized()) {
            initializePostHog()
          }
        } else if (changes[CONSENT_STORAGE_KEY].newValue === false) {
          // Consent revoked - reset PostHog UI instance
          resetPostHogUI()
        }
      }
    }

    if (isMounted) {
      initializePostHog()
    }

    try {
      chrome.storage.onChanged.addListener(handleConsentChange)
    } catch (_) {
      // Ignore if chrome is not available (e.g., during tests)
    }

    // Cleanup function
    return () => {
      isMounted = false
      try {
        chrome.storage.onChanged.removeListener(handleConsentChange)
      } catch (_) {
        /* noop */
      }
      if (isPostHogInitialized()) {
        delete (window as any).__scrape_similar_posthog
        log.debug('PostHog instance removed from window')
      }
    }
  }, []) // Empty dependency array since all functions are defined within the effect

  return <>{children}</>
}
