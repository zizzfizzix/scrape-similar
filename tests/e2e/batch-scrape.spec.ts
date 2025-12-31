import { expect, test, TestHelpers } from './fixtures'

test.describe('Batch Scrape', () => {
  test('should open batch scrape page from sidepanel button', async ({ page, extensionId }) => {
    // Navigate to a test page
    await page.goto(
      'https://en.wikipedia.org/wiki/List_of_countries_by_population_(United_Nations)',
    )

    // Open sidepanel
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)

    // Wait for sidepanel to load
    await page.waitForSelector('[data-testid="config-form"]', { timeout: 5000 }).catch(() => null)

    // Find and click the batch scrape button (with Layers icon)
    const batchButton = page.locator('button:has(svg.lucide-layers)')
    await expect(batchButton).toBeVisible()
    await batchButton.click()

    // Wait for new tab to open with batch scrape page
    const newPage = await page.context().waitForEvent('page')
    await newPage.waitForLoadState()

    // Verify batch scrape page loaded
    await expect(newPage).toHaveURL(/app\.html#\/scrapes\/new/)
    await expect(newPage.locator('text=URLs to Scrape')).toBeVisible()
    await expect(newPage.locator('text=Scrape Configuration')).toBeVisible()
  })

  test('should open batch scrape history page', async ({ page, extensionId }) => {
    // Open batch scrape history directly
    await page.goto(`chrome-extension://${extensionId}/app.html#/scrapes`)

    // Verify history page loaded
    await expect(page.locator('text=Batch Scrapes')).toBeVisible()
    await expect(page.locator('text=New Batch')).toBeVisible()
  })

  test('should validate URLs in batch scrape page', async ({ page, extensionId }) => {
    // Open batch scrape page
    await page.goto(`chrome-extension://${extensionId}/app.html#/scrapes/new`)

    // Enter some URLs
    const urlsTextarea = page.locator('textarea#urls-input')
    await urlsTextarea.fill(`
      https://example.com/page1
      https://example.com/page2
      invalid-url
      https://example.com/page1
    `)

    // Wait for validation
    await page.waitForTimeout(500)

    // Check validation results
    await expect(page.locator('text=2 valid')).toBeVisible()
    await expect(page.locator('text=1 invalid')).toBeVisible()
    await expect(page.locator('text=1 duplicates removed')).toBeVisible()
  })

  test('should navigate from scrapes list to new scrape page', async ({ page, extensionId }) => {
    // Open batch scrape history
    await page.goto(`chrome-extension://${extensionId}/app.html#/scrapes`)

    // Click New Batch button
    await page.getByRole('link', { name: /new batch/i }).click()

    // Verify navigation to new scrape page
    await expect(page).toHaveURL(/app\.html#\/scrapes\/new/)
    await expect(page.locator('text=URLs to Scrape')).toBeVisible()
  })

  test('should navigate back to scrapes list from new scrape page', async ({
    page,
    extensionId,
  }) => {
    // Open new scrape page
    await page.goto(`chrome-extension://${extensionId}/app.html#/scrapes/new`)

    // Click Back to Batches button
    await page.getByRole('link', { name: /back to batches/i }).click()

    // Verify navigation back to list
    await expect(page).toHaveURL(/app\.html#\/scrapes$/)
    await expect(page.locator('text=Batch Scrapes')).toBeVisible()
  })
})

test.describe('SidePanel on Batch Scrape Pages', () => {
  test('shows batch scrape mode message when viewing scrapes list', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to scrapes list
    const scrapesPage = await context.newPage()
    await scrapesPage.goto(`chrome-extension://${extensionId}/app.html#/scrapes`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    // Bring scrapes page to front
    await scrapesPage.bringToFront()

    // Should show batch scrape mode message
    await expect(
      sidePanel.getByRole('heading', { name: /batch scrape mode active/i }),
    ).toBeVisible()

    // Should NOT show the normal sidepanel controls
    await expect(sidePanel.getByRole('textbox', { name: /main selector/i })).toBeHidden()

    // Should NOT show compact view button (only for data view)
    await expect(sidePanel.getByRole('button', { name: /compact view/i })).toBeHidden()
  })

  test('shows batch scrape mode message when viewing new scrape page', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to new scrape page
    const newScrapePage = await context.newPage()
    await newScrapePage.goto(`chrome-extension://${extensionId}/app.html#/scrapes/new`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    // Bring new scrape page to front
    await newScrapePage.bringToFront()

    // Should show batch scrape mode message
    await expect(
      sidePanel.getByRole('heading', { name: /batch scrape mode active/i }),
    ).toBeVisible()

    // Should NOT show the normal sidepanel controls
    await expect(sidePanel.getByRole('textbox', { name: /main selector/i })).toBeHidden()
  })

  test('shows onboarding active message when viewing onboarding page', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to onboarding
    const onboardingPage = await context.newPage()
    await onboardingPage.goto(`chrome-extension://${extensionId}/app.html#/onboarding`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    // Bring onboarding page to front
    await onboardingPage.bringToFront()

    // Should show onboarding mode message
    await expect(sidePanel.getByRole('heading', { name: /onboarding active/i })).toBeVisible()

    // Should NOT show the normal sidepanel controls
    await expect(sidePanel.getByRole('textbox', { name: /main selector/i })).toBeHidden()
  })
})
