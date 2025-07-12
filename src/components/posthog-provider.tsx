import log from 'loglevel'
// Posthog needs to be imported this way, otherwise the extension doesn't pass the Chrome Web Store review
// https://github.com/PostHog/posthog-js/issues/1464#issuecomment-2792093981
import 'posthog-js/dist/dead-clicks-autocapture.js'
import 'posthog-js/dist/exception-autocapture.js'
import posthog from 'posthog-js/dist/module.no-external'
import 'posthog-js/dist/posthog-recorder.js'
import 'posthog-js/dist/surveys.js'
import 'posthog-js/dist/tracing-headers.js'
import 'posthog-js/dist/web-vitals.js'
import React, { createContext, useContext, useEffect } from 'react'

interface PostHogWrapperProps {
  children: React.ReactNode
}

// Create our own PostHog context since we're using the no-external module
const PostHogContext = createContext<typeof posthog | undefined>(undefined)

export const usePostHog = () => {
  const context = useContext(PostHogContext)
  if (context === undefined) {
    throw new Error('usePostHog must be used within a PostHogWrapper')
  }
  return context
}

const isPostHogInitialized = () => {
  return (
    (window as any).__scrape_similar_posthog &&
    typeof (window as any).__scrape_similar_posthog === 'function'
  )
}

export const PostHogWrapper: React.FC<PostHogWrapperProps> = ({ children }) => {
  useEffect(() => {
    const initializePostHog = async () => {
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

        // Initialize PostHog with the no-external module
        posthog.init(apiKey, {
          api_host: apiHost,
          persistence: 'memory', // Use memory persistence to avoid cookie consent requirements
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
          // Set global properties that will be included with every event
          loaded: (posthogInstance) => {
            // Expose PostHog instance to window for analytics utility
            // Using a custom property name to avoid conflicts with website's PostHog
            ;(window as any).__scrape_similar_posthog = posthogInstance
            log.debug('PostHog instance exposed to window.__scrape_similar_posthog')
          },
        })
      } catch (error) {
        log.error('Failed to initialize PostHog:', error)
      }
    }

    if (!isPostHogInitialized()) {
      initializePostHog()
    }

    // Cleanup function to remove PostHog from window when component unmounts
    return () => {
      if (isPostHogInitialized()) {
        delete (window as any).__scrape_similar_posthog
        log.debug('PostHog instance removed from window')
      }
    }
  }, [])

  return <PostHogContext.Provider value={posthog}>{children}</PostHogContext.Provider>
}
