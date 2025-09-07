import { expect, test, TestHelpers } from './fixtures'

/**
 * Onboarding flow tests
 */

test.describe('Onboarding Flow', () => {
  test('completes onboarding flow and opens sidepanel with Wikipedia navigation', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent first
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Wait for onboarding to load
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    await expect(nextButton).toBeVisible()

    // Navigate through slides until we reach the final slide with "Start" button
    let startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    // Trigger sidepanel and wiki page opening
    const [sidepanelPage] = await Promise.all([
      context.waitForEvent('page', {
        predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
      }),
      onboardingPage.waitForURL(/https:\/\/en\.wikipedia\.org\/wiki\//),
      startButton.click(),
    ])

    // Verify the sidepanel opened successfully
    expect(sidepanelPage.isClosed()).toBe(false)

    // Verify the Wikipedia page loaded (should have redirected from Special:Random to actual article)
    expect(onboardingPage.url()).not.toMatch(/Special:Random/) // Should have redirected to actual article
  })

  test('can navigate backwards through onboarding slides', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent first
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Wait for first slide
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Get Started' }),
    ).toBeVisible()

    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })

    // Go to second slide
    await nextButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Pin the Extension' }),
    ).toBeVisible()

    // Go to third slide
    await nextButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Keyboard Shortcut' }),
    ).toBeVisible()

    // Now go back to second slide
    const previousButton = onboardingPage.getByRole('button', { name: /previous/i })
    await previousButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Pin the Extension' }),
    ).toBeVisible()

    // Go back to first slide
    await previousButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Get Started' }),
    ).toBeVisible()

    // Previous button should not be visible on first slide
    await expect(previousButton).not.toBeVisible()
  })
})
