// PostHog initialization for background service workers and non-React contexts
// This allows tracking events directly from the background script without message passing

import { isDevOrTest } from '@/utils/modeTest'
import log from 'loglevel'

// Import PostHog core library for service workers
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import 'posthog-js/dist/exception-autocapture.js'
import { PostHog } from 'posthog-js/dist/module.no-external'
import 'posthog-js/dist/tracing-headers.js'

let posthogInstance: PostHog | null = null
let initializationPromise: Promise<PostHog | null> | null = null
// Bumped by every reset, so an initialisation the reset overtook can tell its
// instance is no longer wanted.
let generation = 0
const stopWatchingDebugMode = new WeakMap<PostHog, () => void>()

// Dropping the reference is not enough: the instance's exception handlers stay
// installed and keep sending, and its debug-mode watch keeps it alive. Opting
// out instead would persist under the token and silence every later instance.
const retire = (instance: PostHog) => {
  instance.stopExceptionAutocapture()
  stopWatchingDebugMode.get(instance)?.()
}

/**
 * Reset PostHog instance - used when consent is revoked
 */
export const resetPostHogInstance = () => {
  generation += 1
  if (posthogInstance) retire(posthogInstance)
  posthogInstance = null
  initializationPromise = null
  log.debug('PostHog background instance reset due to consent revocation')
}

/** The initialised instance, if any, without starting an initialisation. */
export const currentPostHogBackground = (): PostHog | null => posthogInstance

const initializePostHog = async (): Promise<PostHog | null> => {
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

    const isDebugModeEnabled = await debugModeItem.getValue()

    // Initialize PostHog instance
    const posthogInstance = new PostHog()
    posthogInstance.init(apiKey, {
      debug: isDevOrTest || isDebugModeEnabled,
      // Supply our own distinct_id to ensure consistent distinct_id across extension contexts
      bootstrap: {
        distinctID: distinctId.toString(),
      },
      api_host: apiHost,
      persistence: 'localStorage',
      // Required to capture exceptions from a browser extension
      error_tracking: {
        captureExtensionExceptions: true,
      },
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

    // React to debugMode changes in production to keep config in sync
    if (!isDevOrTest) {
      stopWatchingDebugMode.set(
        posthogInstance,
        debugModeItem.watch((isEnabled) => {
          posthogInstance.set_config({ debug: isEnabled })
        }),
      )
    }

    log.debug('PostHog background service worker initialized successfully')
    return posthogInstance
  } catch (error) {
    log.error('Failed to initialize PostHog in background:', error)
    return null
  }
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

  const startedIn = generation
  const pending = (async (): Promise<PostHog | null> => {
    const instance = await initializePostHog()
    // Consent was withdrawn while this initialised: keeping the instance would
    // let it capture (exceptions included) after the user said no.
    if (generation !== startedIn) {
      if (instance) retire(instance)
      return null
    }
    posthogInstance = instance
    return instance
  })()
  initializationPromise = pending

  try {
    return await pending
  } finally {
    if (initializationPromise === pending) initializationPromise = null
  }
}
