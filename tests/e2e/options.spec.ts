import { expect, test, TestHelpers } from './fixtures'

/**
 * Tests specific to the Options page functionality that aren't covered by
 * other consolidated test files (analytics-consent.spec.ts, debug-mode.spec.ts).
 */

test.describe('Options page', () => {
  test('loads correctly and shows expected title', async ({ context, extensionId }) => {
    const page = await TestHelpers.openOptionsPage(context, extensionId)
    await expect(page).toHaveTitle('Scrape Similar - Settings')
  })

  test('default theme is system and follows system preference (dark)', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Ensure no persisted theme override and dismiss analytics
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    await serviceWorker.evaluate(() => chrome.storage.local.remove('theme'))

    // Open options with the browser preferring dark
    const page = await context.newPage()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    // Button shows "System"
    await expect(page.getByRole('button', { name: 'System', exact: true })).toBeVisible()
    const prefersDark = page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
    expect(await prefersDark).toBeTruthy()

    // Root gets dark class and variables
    const isDark = await page.evaluate(() => {
      const root = document.documentElement
      const bg = getComputedStyle(root).getPropertyValue('--background').trim()
      return { hasDark: root.classList.contains('dark'), bg }
    })
    expect(isDark.hasDark).toBeTruthy()
    expect(isDark.bg).toContain('oklch(0% 0 0)') // dark background
  })

  test('default theme is system and follows system preference (light)', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Ensure no persisted theme override and dismiss analytics
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    await serviceWorker.evaluate(() => chrome.storage.local.remove('theme'))

    // Open options with the browser preferring light
    const page = await context.newPage()
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    // Button shows "System"
    await expect(page.getByRole('button', { name: 'System', exact: true })).toBeVisible()

    // Root gets light class and variables
    const isLight = await page.evaluate(() => {
      const root = document.documentElement
      const bg = getComputedStyle(root).getPropertyValue('--background').trim()
      return { hasLight: root.classList.contains('light'), bg }
    })
    expect(isLight.hasLight).toBeTruthy()
    expect(isLight.bg).toContain('oklch(99% 0 0)') // light background
  })

  test('default theme is system and reacts to changing system preferences', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Ensure no persisted theme override and dismiss analytics
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    await serviceWorker.evaluate(() => chrome.storage.local.remove('theme'))

    // Open options with the browser preferring dark
    const page = await context.newPage()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    // Button shows "System"
    await expect(page.getByRole('button', { name: 'System', exact: true })).toBeVisible()
    const prefersDark = page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
    expect(await prefersDark).toBeTruthy()

    // Root gets dark class and variables
    const isDark = await page.evaluate(() => {
      const root = document.documentElement
      const bg = getComputedStyle(root).getPropertyValue('--background').trim()
      return { hasDark: root.classList.contains('dark'), bg }
    })
    expect(isDark.hasDark).toBeTruthy()
    expect(isDark.bg).toContain('oklch(0% 0 0)') // dark background

    await page.emulateMedia({ colorScheme: 'light' })

    const prefersLight = page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches)
    expect(await prefersLight).toBeTruthy()

    // Wait until the system theme is detected and applied
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('light')))
      .toBeTruthy()

    // Root updates to light class and variables
    const lightBg = await page.evaluate(() => {
      const root = document.documentElement
      return getComputedStyle(root).getPropertyValue('--background').trim()
    })

    expect(lightBg).toContain('oklch(99% 0 0)') // light background
  })

  test('forcing light and dark overrides system preference', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Start with system preferring dark, and clear overrides
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    await serviceWorker.evaluate(() => chrome.storage.local.remove('theme'))

    const page = await context.newPage()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    // Open theme dropdown and force Light
    await page.getByRole('button', { name: 'System', exact: true }).click()
    await page.getByRole('menuitem', { name: /^light$/i }).click()

    // Button updates and root becomes light; storage reflects override
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.classList.contains('light') &&
            !document.documentElement.classList.contains('dark'),
        ),
      )
      .toBeTruthy()
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => (await chrome.storage.local.get('theme')).theme),
      )
      .toBe('light')

    // Switch back to System; should follow browser (dark)
    await page.getByRole('button', { name: /light/i }).click()
    await page.getByRole('menuitem', { name: /^system$/i }).click()
    await expect(page.getByRole('button', { name: 'System', exact: true })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBeTruthy()

    // Change system to light; root should update
    await page.emulateMedia({ colorScheme: 'light' }) // ensure browser is light
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('light')))
      .toBeTruthy()

    // Force Dark explicitly; page switches to dark immediately
    await page.getByRole('button', { name: 'System', exact: true }).click()
    await page.getByRole('menuitem', { name: /^dark$/i }).click()
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.classList.contains('dark') &&
            !document.documentElement.classList.contains('light'),
        ),
      )
      .toBeTruthy()
  })
})
