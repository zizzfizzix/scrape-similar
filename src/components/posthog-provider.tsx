import { BOOTSTRAPPED_FLAGS, syncFeatureFlagsFromPostHog } from '@/utils/feature-flags'
import log from 'loglevel'
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import { isDevOrTest } from '@/utils/modeTest'
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
      const distinctId = await getOrCreateDistinctId()

      // Initialize PostHog instance
      const posthogInstance = new PostHog()
      posthogInstance.init(apiKey, {
        debug: isDevOrTest || !!(await storage.getItem<boolean>('local:debugMode')),
        // Supply our own distinct_id to ensure consistent distinct_id across extension contexts
        bootstrap: {
          distinctID: distinctId.toString(),
          featureFlags: BOOTSTRAPPED_FLAGS,
        },
        api_host: apiHost,
        persistence: 'localStorage',
        // Disable external loading to be compatible with Manifest V3
        disable_external_dependency_loading: true,
        // Session replay configuration for Manifest V3
        session_recording: {
          recordCrossOriginIframes: false, // Disable for security in extensions
          maskTextSelector: '.ph_hidden', // masks all elements with the class "ph_hidden"
        },
        // Required to capture exceptions from a browser extension
        error_tracking: {
          captureExtensionExceptions: true,
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

          // Sync feature flags from PostHog when they're loaded from server
          posthogInstance.onFeatureFlags(() => {
            syncFeatureFlagsFromPostHog(posthogInstance)
          })
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
  const { loading, state: consentState } = useConsent()

  // Whenever consent changes, (init / reset) PostHog
  useEffect(() => {
    if (loading) return

    if (consentState === true && !isPostHogInitialized()) {
      initializePostHog()
    } else if (consentState === false) {
      resetPostHogUI()
    } else if (consentState === undefined) {
      // undecided – ensure PostHog is reset
      resetPostHogUI()
    }

    return () => {
      if (isPostHogInitialized()) {
        delete (window as any).__scrape_similar_posthog
        log.debug('PostHog instance removed from window')
      }
    }
  }, [loading, consentState])

  // Sync PostHog debug config with storage changes (production only)
  useEffect(() => {
    if (isDevOrTest) return

    const unwatch = storage.watch<boolean>('local:debugMode', (val) => {
      if (isPostHogInitialized()) {
        ;(window as any).__scrape_similar_posthog.set_config({ debug: !!val })
      }
    })

    return () => {
      if (unwatch) unwatch()
    }
  }, [])

  return <>{children}</>
}
