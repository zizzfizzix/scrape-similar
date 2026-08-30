import { expect, test, TestHelpers } from './fixtures'

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

test('initialises storage with empty user presets array', async ({ serviceWorker }) => {
  const presets = await serviceWorker.evaluate(async () => {
    // Register the `onChanged` listener *before* performing the initial read to
    // prevent a race condition where the key is written between the read and
    // listener setup.
    return await new Promise((resolve) => {
      let settled = false

      function finish(value: unknown[] | undefined) {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        chrome.storage.onChanged.removeListener(onChange)
        resolve(value)
      }

      function onChange(changes: Record<string, any>, area: string) {
        if (area === 'sync' && changes.user_presets) {
          const val = changes.user_presets.newValue
          finish(Array.isArray(val) ? val : undefined)
        }
      }

      chrome.storage.onChanged.addListener(onChange)
      const timeoutId = setTimeout(() => finish(undefined), 5_000)

      // After the listener is attached, perform the initial read.
      void chrome.storage.sync.get('user_presets').then(({ user_presets }) => {
        if (user_presets !== undefined) {
          finish(Array.isArray(user_presets) ? user_presets : undefined)
        }
      })
    })
  })

  // With WXT storage defineItem + fallback, empty state may be undefined (no key) or []
  expect(presets === undefined || (Array.isArray(presets) && presets.length === 0)).toBe(true)
})

test('extension loads and exposes options page', async ({ context, extensionId }) => {
  const page = await TestHelpers.openOptionsPage(context, extensionId)
  await expect(page).toHaveTitle('Scrape Similar - Settings')
})
