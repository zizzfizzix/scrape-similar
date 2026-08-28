import { removeCachedAuthToken, requestAuthToken } from '@/entrypoints/background/utils/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'

describe('requestAuthToken', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    setLastError(undefined)
  })

  it('resolves with the token returned by the identity API', async () => {
    const getAuthToken = vi
      .spyOn(fakeBrowser.identity, 'getAuthToken')
      .mockResolvedValue({ token: 'ya29.token' } as never)

    await expect(requestAuthToken()).resolves.toEqual({ success: true, token: 'ya29.token' })
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: true })
  })

  it('reports a friendly message when the user cancels the flow', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue({
      token: 'unused',
    } as never)
    setLastError({ message: 'The user cancelled the sign-in flow' })

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'Google authorization was cancelled',
    })
  })

  it('reports a friendly message when the user denies access', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue({
      token: 'unused',
    } as never)
    setLastError({ message: 'Access was denied by the user' })

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'Google authorization was cancelled',
    })
  })

  it('passes any other lastError message through unchanged', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue({
      token: 'unused',
    } as never)
    setLastError({ message: 'OAuth2 not granted or revoked' })

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'OAuth2 not granted or revoked',
    })
  })

  it('falls back to a generic message when lastError has no message', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue({
      token: 'unused',
    } as never)
    setLastError({})

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'Unknown OAuth error',
    })
  })

  it('fails when the identity API resolves without a token', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue({} as never)

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'Failed to get authentication token',
    })
  })

  it('fails when the identity API resolves with no result at all', async () => {
    spyOnBrowser(fakeBrowser.identity, 'getAuthToken').mockResolvedValue(undefined as never)

    await expect(requestAuthToken()).resolves.toEqual({
      success: false,
      error: 'Failed to get authentication token',
    })
  })
})

describe('removeCachedAuthToken', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('forwards the token to the identity API', async () => {
    const removeCachedToken = vi
      .spyOn(fakeBrowser.identity, 'removeCachedAuthToken')
      .mockResolvedValue(undefined as never)

    await removeCachedAuthToken('ya29.token')

    expect(removeCachedToken).toHaveBeenCalledWith({ token: 'ya29.token' })
  })

  it('swallows errors so an expired token never breaks the caller', async () => {
    spyOnBrowser(fakeBrowser.identity, 'removeCachedAuthToken').mockRejectedValue(new Error('nope'))

    await expect(removeCachedAuthToken('ya29.token')).resolves.toBeUndefined()
  })
})
