import { expect, test } from './fixtures'

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
    await expect(newPage).toHaveURL(/batch-scrape\.html/)
    await expect(newPage.locator('text=URLs to Scrape')).toBeVisible()
    await expect(newPage.locator('text=Scrape Configuration')).toBeVisible()
  })

  test('should open batch scrape history page', async ({ page, extensionId }) => {
    // Open batch scrape history directly
    await page.goto(`chrome-extension://${extensionId}/batch-scrape-history.html`)

    // Verify history page loaded
    await expect(page.locator('text=Batch Scrape History')).toBeVisible()
    await expect(page.locator('text=New Batch')).toBeVisible()
  })

  test('should validate URLs in batch scrape page', async ({ page, extensionId }) => {
    // Open batch scrape page
    await page.goto(`chrome-extension://${extensionId}/batch-scrape.html`)

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
})
