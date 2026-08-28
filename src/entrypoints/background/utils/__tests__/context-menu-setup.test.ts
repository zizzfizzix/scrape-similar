import { initializeContextMenus } from '@/entrypoints/background/utils/context-menu-setup'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { setLastError, spyOnBrowser } from '@@/tests/support/fake-browser'

describe('initializeContextMenus', () => {
  let create: MockInstance

  beforeEach(() => {
    fakeBrowser.reset()
    setLastError(undefined)
    create = spyOnBrowser(fakeBrowser.contextMenus, 'create').mockImplementation(() => {})
  })

  it('creates the quick scrape and visual picker items', () => {
    initializeContextMenus()

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0]?.[0]).toEqual({
      id: 'scrape-similar',
      title: 'Quick scrape',
      contexts: ['selection', 'page', 'link', 'image'],
      documentUrlPatterns: [
        'http://*/*',
        'https://*/*',
        `chrome-extension://${fakeBrowser.runtime.id}/onboarding.html`,
      ],
    })
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      id: 'scrape-visual-picker',
      title: 'Visual picker',
    })
  })

  it('logs a debug line for each item created without error', () => {
    const debugSpy = vi.spyOn(log, 'debug').mockImplementation(() => {})

    initializeContextMenus()
    for (const [, callback] of create.mock.calls) callback()

    expect(debugSpy).toHaveBeenCalledWith("Context menu item 'scrape-similar' created successfully")
    expect(debugSpy).toHaveBeenCalledWith(
      "Context menu item 'scrape-visual-picker' created successfully",
    )
  })

  it('logs an error when the browser reports a creation failure', () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const lastError = { message: 'Cannot create item with duplicate id scrape-similar' }
    setLastError(lastError)

    initializeContextMenus()
    create.mock.calls[0]?.[1]()

    expect(errorSpy).toHaveBeenCalledWith(
      "Error creating context menu item 'scrape-similar':",
      lastError,
    )
  })
})
