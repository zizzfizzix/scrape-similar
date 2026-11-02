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
// Set when an initialisation found no consent or no API key or host, none of
// which can change before the next reset.
let isUnavailable = false
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

/** Drops the instance, or the remembered lack of one; called on every consent decision. */
export const resetPostHogInstance = () => {
  generation += 1
  if (posthogInstance) retire(posthogInstance)
  posthogInstance = null
  isUnavailable = false
  initializationPromise = null
  log.debug('PostHog background instance reset')
}

/** The initialised instance, if any, without starting an initialisation. */
export const currentPostHogBackground = (): PostHog | null => posthogInstance

// `unavailable` is remembered until the next reset; `failed` is retried on the
// next call.
type Initialisation = PostHog | 'unavailable' | 'failed'

const initializePostHog = async (startedIn: number): Promise<Initialisation> => {
  const consentState = await getConsentState()
  if (consentState !== true) {
    log.debug('User has not given consent – PostHog will not be initialized (background).')
    return 'unavailable'
  }

  let built: PostHog | null = null
  try {
    const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
    const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

    if (!apiKey) {
      log.warn('PostHog API key not found in environment variables for background script')
      return 'unavailable'
    }

    if (!apiHost) {
      log.warn('PostHog API host not found in environment variables for background script')
      return 'unavailable'
    }

    log.debug('Initializing PostHog in background context...')

    // Retrieve or generate the device ID from shared storage **before** initializing PostHog
    const distinctId: DistinctId = await getOrCreateDistinctId()

    const isDebugModeEnabled = await debugModeItem.getValue()

    // `init` wraps the global error handlers, and retiring an instance unwraps
    // them, so an instance a reset has already overtaken is never initialised:
    // unwrapping it later could remove the handlers of a newer one.
    if (generation !== startedIn) return 'failed'

    const instance = new PostHog()
    built = instance
    instance.init(apiKey, {
      debug: isDevOrTest || isDebugModeEnabled,
      // Supply our own distinct_id to ensure consistent distinct_id across extension contexts
      bootstrap: {
        distinctID: distinctId,
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
        instance,
        debugModeItem.watch((isEnabled) => {
          instance.set_config({ debug: isEnabled })
        }),
      )
    }

    log.debug('PostHog background service worker initialized successfully')
    return instance
  } catch (error) {
    log.error('Failed to initialize PostHog in background:', error)
    // `init` may already have wrapped the global error handlers.
    if (built) retire(built)
    return 'failed'
  }
}

/**
 * Get PostHog instance for background service worker context with proper error handling and race condition protection
 * Returns existing instance if already initialized, otherwise creates and returns new instance
 * Returns null if initialization fails or environment variables are missing
 */
export const getPostHogBackground = async (): Promise<PostHog | null> => {
  if (posthogInstance) {
    return posthogInstance
  }
  if (isUnavailable) return null

  // If already initializing, return the same promise to prevent concurrent initialization
  if (initializationPromise) {
    return initializationPromise
  }

  const startedIn = generation
  const pending = (async (): Promise<PostHog | null> => {
    const outcome = await initializePostHog(startedIn)
    const instance = outcome instanceof PostHog ? outcome : null
    // Consent was withdrawn after the instance was built: keeping it would let
    // it capture (exceptions included) after the user said no.
    if (generation !== startedIn) {
      if (instance) retire(instance)
      return null
    }
    posthogInstance = instance
    isUnavailable = outcome === 'unavailable'
    return instance
  })()
  initializationPromise = pending

  try {
    return await pending
  } finally {
    if (initializationPromise === pending) initializationPromise = null
  }
}
