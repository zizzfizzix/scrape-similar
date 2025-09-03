import { expect, test, TestHelpers } from './fixtures'

/**
 * Consolidated tests for analytics consent functionality across different extension contexts.
 * These tests verify that consent prompts appear correctly and that user decisions are
 * properly persisted in storage.
 */

test.describe('Analytics Consent', () => {
  test.describe('Options Page', () => {
    test('prompts for analytics consent and persists accept decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openOptionsPage(context, extensionId)

      // The consent modal should appear on first visit
      const acceptButton = page.getByRole('button', { name: /accept/i })
      await expect(acceptButton).toBeVisible()

      await acceptButton.click()
      await expect(acceptButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, true)
    })

    test('prompts for analytics consent and persists decline decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openOptionsPage(context, extensionId)

      // The consent modal should appear on first visit
      const declineButton = page.getByRole('button', { name: /decline/i })
      await expect(declineButton).toBeVisible()

      await declineButton.click()
      await expect(declineButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, false)
    })
  })

  test.describe('Sidepanel', () => {
    test('prompts for analytics consent and persists accept decision', async ({
      serviceWorker,
      openSidePanel,
    }) => {
      // Open the side-panel on a blank page
      const sidePanel = await openSidePanel()

      // The consent modal should appear on first visit
      const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
      await expect(acceptButton).toBeVisible()

      // Accept analytics collection
      await acceptButton.click()
      await expect(acceptButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, true)
    })

    test('prompts for analytics consent and persists decline decision', async ({
      serviceWorker,
      openSidePanel,
    }) => {
      // Open the side-panel on a blank page
      const sidePanel = await openSidePanel()

      // The consent modal should appear on first visit
      const declineButton = sidePanel.getByRole('button', { name: /decline/i })
      await expect(declineButton).toBeVisible()

      // Decline analytics collection
      await declineButton.click()
      await expect(declineButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, false)
    })
  })

  test.describe('Full Data View', () => {
    test('prompts for analytics consent and persists accept decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openFullDataViewPage(context, extensionId)

      // The consent modal should appear on first visit
      const acceptButton = page.getByRole('button', { name: /accept/i })
      await expect(acceptButton).toBeVisible()

      await acceptButton.click()
      await expect(acceptButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, true)
    })

    test('prompts for analytics consent and persists decline decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openFullDataViewPage(context, extensionId)

      // The consent modal should appear on first visit
      const declineButton = page.getByRole('button', { name: /decline/i })
      await expect(declineButton).toBeVisible()

      await declineButton.click()
      await expect(declineButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, false)
    })
  })

  test.describe('Onboarding Page', () => {
    test('prompts for analytics consent and persists accept decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openOnboardingPage(context, extensionId)

      // The consent modal should appear on first visit
      const acceptButton = page.getByRole('button', { name: /accept/i })
      await expect(acceptButton).toBeVisible()

      await acceptButton.click()
      await expect(acceptButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, true)
    })

    test('prompts for analytics consent and persists decline decision', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      const page = await TestHelpers.openOnboardingPage(context, extensionId)

      // The consent modal should appear on first visit
      const declineButton = page.getByRole('button', { name: /decline/i })
      await expect(declineButton).toBeVisible()

      await declineButton.click()
      await expect(declineButton).toBeHidden()

      // Verify storage was updated
      await TestHelpers.verifyAnalyticsConsent(serviceWorker, false)
    })
  })
})
