import { expect, test, TestHelpers } from './fixtures'

/**
 * Consolidated tests for debug mode functionality across different extension contexts.
 * Debug mode is a hidden feature that can be unlocked by clicking the settings heading 5 times.
 */

test.describe('Debug Mode', () => {
  test.describe('Options Page', () => {
    test('allows unlocking and toggling debug mode which persists across reloads', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openOptionsPage(context, extensionId)

      // Dismiss consent modal
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)

      // Unlock hidden debug switch by clicking the heading 5×
      await TestHelpers.unlockDebugMode(page)

      const debugSwitch = page.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitch).toBeVisible()
      await expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')

      await debugSwitch.click()
      await expect(debugSwitch).toHaveAttribute('data-state', 'checked')

      // Verify storage was updated
      await TestHelpers.verifyDebugMode(serviceWorker, true)

      // Reload the page — the switch should remain enabled
      await page.reload()
      const debugSwitchAfterReload = page.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitchAfterReload).toHaveAttribute('data-state', 'checked')
    })

    test('debug row hidden by default and appears after 5 header clicks', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      // Dismiss consent modal
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)

      // Reset debug mode and unlock debug row in storage to simulate a fresh state
      await serviceWorker.evaluate(async () => {
        await chrome.storage.local.set({ debugMode: false, debugUnlocked: false })
      })

      const page = await context.newPage()
      await page.goto(`chrome-extension://${extensionId}/options.html`)

      // Debug row should NOT be present initially
      const debugSwitch = page.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitch).toHaveCount(0)

      // Click the Settings header 5 times to unlock
      await TestHelpers.unlockDebugMode(page)

      // Now the debug row should be visible
      await expect(debugSwitch).toHaveCount(1)
      await expect(debugSwitch).toBeVisible()
    })
  })

  test.describe('Sidepanel', () => {
    test('allows unlocking and toggling debug mode which persists across reloads', async ({
      serviceWorker,
      openSidePanel,
      context,
    }) => {
      // Launch the side-panel
      const sidePanel = await openSidePanel()

      // Dismiss consent modal
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)

      // Open a random wiki page for sidepanel to be in a default state
      const randomWikiPage = await TestHelpers.openRandomWikiPage(context)
      await randomWikiPage.bringToFront()

      // Open the settings drawer via the toolbar button
      await sidePanel.getByRole('button', { name: /settings/i }).click()

      // Unlock hidden debug switch by clicking the drawer heading 5×
      await TestHelpers.unlockDebugMode(sidePanel)

      const debugSwitch = sidePanel.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitch).toBeVisible()
      await expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')

      // Enable debug mode
      await debugSwitch.click()
      await expect(debugSwitch).toHaveAttribute('data-state', 'checked')

      // Verify storage was updated
      await TestHelpers.verifyDebugMode(serviceWorker, true)

      // Reload the side-panel — the switch should remain enabled
      await sidePanel.reload()

      // Re-open settings drawer after reload
      await sidePanel.getByRole('button', { name: /settings/i }).click()

      const debugSwitchAfterReload = sidePanel.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitchAfterReload).toHaveAttribute('data-state', 'checked')
    })

    test('debug row hidden by default and appears after 5 header clicks', async ({
      serviceWorker,
      openSidePanel,
      context,
    }) => {
      // Dismiss consent modal
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)

      // Reset debug mode and unlock debug row in storage to simulate a fresh state
      await serviceWorker.evaluate(async () => {
        await chrome.storage.local.set({ debugMode: false, debugUnlocked: false })
      })

      // Launch the side-panel
      const sidePanel = await openSidePanel()

      // Open a random wiki page for sidepanel to be in a default state
      const randomWikiPage = await TestHelpers.openRandomWikiPage(context)
      await randomWikiPage.bringToFront()

      // Open the settings drawer via the toolbar button
      await sidePanel.getByRole('button', { name: /settings/i }).click()

      // Debug row should NOT be present initially
      const debugSwitch = sidePanel.getByRole('switch', { name: /debug mode/i })
      await expect(debugSwitch).toHaveCount(0)

      // Click the Settings drawer heading 5 times to unlock
      await TestHelpers.unlockDebugMode(sidePanel)

      // Now the debug row should be visible
      await expect(debugSwitch).toHaveCount(1)
      await expect(debugSwitch).toBeVisible()
    })
  })
})
