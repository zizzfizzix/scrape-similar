import { BrowserContext } from '@playwright/test'
import { expect, test, waitForChromeApi } from './fixtures'

/**
 * Scenarios that verify the extension's default state immediately after a fresh
 * install. Because Playwright launches a brand-new Chromium user-data-dir for
 * every test run, the extension's `onInstalled` handler will run each time,
 * giving us deterministic behaviour.
 */

test('opens onboarding page on first install', async ({ context, extensionId }) => {
  const maybeOnboarding = context
    .pages()
    .find((p) => p.url().includes(`chrome-extension://${extensionId}/`))

  const onboardingPage =
    maybeOnboarding ??
    (await context.waitForEvent('page', {
      predicate: (p) => p.url().includes(`chrome-extension://${extensionId}/`),
      timeout: 5_000,
    }))

  expect(onboardingPage).toBeTruthy()
  expect(onboardingPage.url()).toBe(`chrome-extension://${extensionId}/onboarding.html`)
})

test('initialises storage with empty user presets array', async ({
  context,
  extensionId,
}: {
  context: BrowserContext
  extensionId: string
}) => {
  // Wait for the extension's service worker to be registered. Filter for workers whose
  // URL scheme is `chrome-extension://` – this ensures we attach to the correct worker.
  let extensionWorker = context
    .serviceWorkers()
    .find((w) => w.url().startsWith(`chrome-extension://${extensionId}`))

  if (!extensionWorker) {
    extensionWorker = await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().startsWith(`chrome-extension://${extensionId}`),
      timeout: 5_000,
    })
  }

  // Wait for the Chrome storage API to be available, sometimes it takes a while
  await waitForChromeApi(extensionWorker)

  const presets = await extensionWorker.evaluate(async () => {
    // Register the `onChanged` listener *before* performing the initial read to
    // prevent a race condition where the key is written between the read and
    // listener setup.
    return await new Promise(async (resolve) => {
      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      function finish(value: [] | undefined) {
        if (settled) return
        settled = true
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId)
        }
        chrome.storage.onChanged.removeListener(onChange)
        resolve(value)
      }

      function onChange(changes: Record<string, any>, area: string) {
        if (area === 'sync' && changes.user_presets) {
          finish(changes.user_presets.newValue)
        }
      }

      chrome.storage.onChanged.addListener(onChange)

      // After the listener is attached, perform the initial read.
      const { user_presets } = await chrome.storage.sync.get('user_presets')
      if (user_presets !== undefined) {
        finish(user_presets)
      }

      timeoutId = setTimeout(() => finish(undefined), 5_000)
    })
  })

  expect(presets).toEqual([])
})

test('extension loads and exposes options page', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page).toHaveTitle('Scrape Similar - Settings')
})
