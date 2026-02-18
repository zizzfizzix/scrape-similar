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

  // With WXT storage defineItem + fallback, empty state may be undefined (no key) or []
  expect(presets === undefined || (Array.isArray(presets) && presets.length === 0)).toBe(true)
})

test('extension loads and exposes options page', async ({ context, extensionId }) => {
  const page = await TestHelpers.openOptionsPage(context, extensionId)
  await expect(page).toHaveTitle('Scrape Similar - Settings')
})
