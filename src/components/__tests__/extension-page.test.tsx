// @vitest-environment jsdom
import { ExtensionPageRoot, mountExtensionPage } from '@/components/extension-page'
import { ANALYTICS_CONSENT_STORAGE_KEY } from '@/utils/consent'
import log from 'loglevel'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

// The PostHog bundles need a real browsing context to load; only the provider
// nesting is under test here.
vi.mock('posthog-js/dist/module.no-external', () => ({ PostHog: class PostHog {} }))
vi.mock('posthog-js/dist/dead-clicks-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/exception-autocapture.js', () => ({}))
vi.mock('posthog-js/dist/posthog-recorder.js', () => ({}))
vi.mock('posthog-js/dist/surveys.js', () => ({}))
vi.mock('posthog-js/dist/tracing-headers.js', () => ({}))
vi.mock('posthog-js/dist/web-vitals.js', () => ({}))

let mounted: ReturnType<typeof mountExtensionPage> = null

const withRootElement = (id: string) => {
  const container = document.createElement('div')
  container.id = id
  document.body.append(container)
  return container
}

beforeEach(async () => {
  fakeBrowser.reset()
  await storage.setItem(`sync:${ANALYTICS_CONSENT_STORAGE_KEY}`, true)
})

afterEach(async () => {
  await act(async () => {
    mounted?.unmount()
  })
  mounted = null
  document.body.innerHTML = ''
})

describe('mountExtensionPage', () => {
  it('renders into the element the page names', async () => {
    const container = withRootElement('root')

    await act(async () => {
      mounted = mountExtensionPage('root', <p>The page</p>)
    })

    expect(container.textContent).toBe('The page')
    expect(mounted).not.toBeNull()
  })

  it('reports a page whose root element is missing, without throwing', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})

    await act(async () => {
      mounted = mountExtensionPage('missing', <p>The page</p>)
    })

    expect(mounted).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith('Root element #missing not found')
  })
})

describe('ExtensionPageRoot', () => {
  it('renders the page inside the shared providers', async () => {
    const container = withRootElement('root')

    await act(async () => {
      mounted = mountExtensionPage(
        'root',
        <ExtensionPageRoot>
          <p>The page</p>
        </ExtensionPageRoot>,
      )
    })

    expect(container.textContent).toBe('The page')
    // `ThemeProvider` is the outermost of them, and it claims the document.
    expect(document.documentElement.className).not.toBe('')
  })
})
