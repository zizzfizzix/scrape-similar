import log from 'loglevel'

/**
 * Request OAuth authentication token from Google
 * Opens interactive auth flow if needed
 */
export const requestAuthToken = (): Promise<{
  success: boolean
  token?: string
  error?: string
}> =>
  browser.identity
    .getAuthToken({ interactive: true })
    .then((result: Browser.identity.GetAuthTokenResult) => {
      if (browser.runtime.lastError) {
        const errorMessage = browser.runtime.lastError.message || 'Unknown OAuth error'

        // Check if user cancelled the auth flow
        if (errorMessage.includes('cancelled') || errorMessage.includes('denied')) {
          return { success: false, error: 'Google authorization was cancelled' }
        } else {
          return { success: false, error: errorMessage }
        }
      }

      if (!result?.token) {
        return { success: false, error: 'Failed to get authentication token' }
      }

      return { success: true, token: result.token }
    })

/**
 * Remove cached auth token (e.g. when expired)
 */
export const removeCachedAuthToken = async (token: string): Promise<void> => {
  try {
    await browser.identity.removeCachedAuthToken({ token })
  } catch (error) {
    log.warn('Failed to remove cached auth token:', error)
  }
}
