import { BrowserContext, Page } from '@playwright/test'
import { expect, test, waitForChromeApi } from './fixtures'

test.describe('Options page', () => {
  const openOptionsPage = async (context: BrowserContext, extensionId: string): Promise<Page> => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    return page
  }

  test('prompts for analytics consent and persists accept decision', async ({
    context,
    extensionId,
  }) => {
    const [serviceWorker] = context.serviceWorkers()
    const page = await openOptionsPage(context, extensionId)

    // The consent modal should appear on first visit.
    const acceptButton = page.getByRole('button', { name: /accept/i })
    await expect(acceptButton).toBeVisible()

    await acceptButton.click()
    await expect(acceptButton).toBeHidden()

    // Verify chrome.storage.sync.analytics_consent is true
    await waitForChromeApi(serviceWorker)
    const consent = await serviceWorker.evaluate(async () => {
      const { analytics_consent } = await chrome.storage.sync.get('analytics_consent')
      return analytics_consent
    })

    expect(consent).toBe(true)
  })

  test('prompts for analytics consent and persists decline decision', async ({
    context,
    extensionId,
  }) => {
    const [serviceWorker] = context.serviceWorkers()
    const page = await openOptionsPage(context, extensionId)

    // The consent modal should appear on first visit.
    const declineButton = page.getByRole('button', { name: /decline/i })
    await expect(declineButton).toBeVisible()

    await declineButton.click()
    await expect(declineButton).toBeHidden()

    // Verify chrome.storage.sync.analytics_consent is false
    await waitForChromeApi(serviceWorker)
    const consent = await serviceWorker.evaluate(async () => {
      const { analytics_consent } = await chrome.storage.sync.get('analytics_consent')
      return analytics_consent
    })

    expect(consent).toBe(false)
  })

  test('allows unlocking and toggling debug mode which persists across reloads', async ({
    context,
    extensionId,
  }) => {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    const page = await openOptionsPage(context, extensionId)

    // Dismiss consent modal if present (reuse helper expectations).
    const acceptButton = page.getByRole('button', { name: /accept/i })
    if (await acceptButton.isVisible()) {
      await acceptButton.click()
      await expect(acceptButton).toBeHidden()
    }

    // Unlock hidden debug switch by clicking the heading 5×.
    const heading = page.getByRole('heading', { name: /settings/i })
    for (let i = 0; i < 5; i++) {
      await heading.click()
    }

    const debugSwitch = page.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitch).toBeVisible()
    await expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')

    await debugSwitch.click()
    await expect(debugSwitch).toHaveAttribute('data-state', 'checked')

    // Verify storage mutation (chrome.storage.local.debugMode === true).
    await waitForChromeApi(serviceWorker)
    const debugMode = await serviceWorker.evaluate(async () => {
      const { debugMode } = await chrome.storage.local.get('debugMode')
      return debugMode
    })
    expect(debugMode).toBe(true)

    // Reload the page — the switch should remain enabled.
    await page.reload()
    const debugSwitchAfterReload = page.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitchAfterReload).toHaveAttribute('data-state', 'checked')
  })

  test('debug row hidden by default and appears after 5 header clicks', async ({
    context,
    extensionId,
  }) => {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker')
    }

    await waitForChromeApi(serviceWorker)

    // Reset debug mode and unlock debug row in storage to simulate a fresh state
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({ debugMode: false, debugUnlocked: false })
    })

    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)

    // Dismiss consent modal if it shows up
    const declineButton = page.getByRole('button', { name: /decline/i })
    if (await declineButton.isVisible().catch(() => false)) {
      await declineButton.click()
      await expect(declineButton).toBeHidden()
    }

    // Debug row should NOT be present initially
    const debugSwitch = page.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitch).toHaveCount(0)

    // Click the Settings header 5 times to unlock
    const heading = page.getByRole('heading', { name: /settings/i })
    for (let i = 0; i < 5; i++) {
      await heading.click()
    }

    // Now the debug row should be visible
    await expect(debugSwitch).toHaveCount(1)
    await expect(debugSwitch).toBeVisible()
  })
})
