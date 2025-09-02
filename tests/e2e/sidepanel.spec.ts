import fs from 'fs/promises'
import { expect, test } from './fixtures'

test.describe('Sidepanel', () => {
  test('sidepanel shows unsupported URL splash when opened on a non-supported URL', async ({
    context,
    extensionId,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    await expect(sidePanel).toBeTruthy()

    const testPage = await context.newPage()
    await testPage.goto(`chrome-extension://${extensionId}/options.html`)

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    await expect(sidePanel.getByText(/unsupported url/i)).toBeVisible()
  })

  test("sidepanel doesn't show unsupported URL splash when opened on a supported URL", async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    await expect(sidePanel).toBeTruthy()

    const testPage = await context.newPage()
    await testPage.goto('https://one.one.one.one/')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    await expect(sidePanel.getByText(/unsupported url/i)).toBeHidden()
  })

  test('prompts for analytics consent and persists accept decision', async ({
    serviceWorker,
    openSidePanel,
  }) => {
    // Open the side-panel on a blank page.
    const sidePanel = await openSidePanel()

    // The consent modal should appear on first visit.
    const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
    await expect(acceptButton).toBeVisible()

    // Accept analytics collection.
    await acceptButton.click()
    await expect(acceptButton).toBeHidden()

    // Verify chrome.storage.sync.analytics_consent is true.
    const consent = await serviceWorker.evaluate(async () => {
      const { analytics_consent } = await chrome.storage.sync.get('analytics_consent')
      return analytics_consent
    })

    expect(consent).toBe(true)
  })

  test('allows unlocking and toggling debug mode which persists across reloads', async ({
    serviceWorker,
    openSidePanel,
  }) => {
    // Launch the side-panel.
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Open the settings drawer via the toolbar button.
    await sidePanel.getByRole('button', { name: /settings/i }).click()

    // Unlock hidden debug switch by clicking the drawer heading 5×.
    const heading = sidePanel.getByRole('heading', { name: /settings/i })
    for (let i = 0; i < 5; i++) {
      await heading.click()
    }

    const debugSwitch = sidePanel.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitch).toBeVisible()
    await expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')

    // Enable debug mode.
    await debugSwitch.click()
    await expect(debugSwitch).toHaveAttribute('data-state', 'checked')

    // Confirm storage mutation (chrome.storage.local.debugMode === true).
    const debugMode = await serviceWorker.evaluate(async () => {
      const { debugMode } = await chrome.storage.local.get('debugMode')
      return debugMode
    })
    expect(debugMode).toBe(true)

    // Reload the side-panel and reopen the settings drawer — the switch should remain enabled.
    await sidePanel.reload()
    await sidePanel.getByRole('button', { name: /settings/i }).click()
    const debugSwitchAfterReload = sidePanel.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitchAfterReload).toHaveAttribute('data-state', 'checked')
  })

  test('shows error badge for invalid XPath selector', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Type an obviously invalid XPath selector and commit with Enter.
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//*[')
    await mainSelector.press('Enter')

    // Expect a destructive badge with an alert icon (svg) to appear.
    const errorBadge = sidePanel.locator('[data-slot="badge"] svg')
    await expect(errorBadge).toBeVisible({ timeout: 1000 })
  })

  test('shows numeric match-count badge for valid XPath selector', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Provide a valid selector that should match many elements.
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//p')
    await mainSelector.press('Enter')

    // Expect a badge whose text is a positive integer to appear.
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible({ timeout: 5000 })
    const badgeText = await countBadge.textContent()
    expect(parseInt(badgeText || '0', 10)).toBeGreaterThan(0)
  })

  test('scrapes page and displays data table for matching selector', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    // Open a real, injectable page so the content script can run.
    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Enter selector that matches multiple elements and commit.
    const input = sidePanel.locator('#mainSelector')
    await input.fill('//h2')
    await input.press('Enter')

    // Wait for match-count badge to appear confirming highlight is done.
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Click the Scrape button.
    const scrapeBtn = sidePanel.getByRole('button', { name: /^scrape$/i })
    await scrapeBtn.click()

    // Data table heading should appear.
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 50000,
    })
  })

  test('shows "0 found" state when scrape yields no results', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    // Open a real page.
    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Bring side-panel to front.
    await sidePanel.bringToFront()

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Enter selector that matches nothing.
    const input = sidePanel.locator('#mainSelector')
    await input.fill('//*[@id="nonexistent_element_for_test"]')
    await input.press('Enter')

    // Wait for highlight badge (will show 0).
    const zeroBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^0$/ })
    await expect(zeroBadge).toBeVisible({ timeout: 5000 })

    // Click Scrape.
    const scrapeBtn = sidePanel.getByRole('button', { name: /^scrape$/i })
    await scrapeBtn.click()

    // Expect button text to show "0 found".
    await expect(sidePanel.getByRole('button', { name: /0 found/i })).toBeVisible({ timeout: 1500 })
  })

  test('can save preset and reload it via Load combobox', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    // Open real page for highlight/scrape logic.
    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Configure selector.
    const selectorValue = '//h2'
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill(selectorValue)
    await mainSelector.press('Enter')

    // Wait for valid badge so Save button becomes enabled.
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Open Save Preset drawer.
    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .first()
      .click()

    const presetName = `Test Preset ${Date.now()}`
    const presetNameInput = sidePanel.getByPlaceholder('Preset name')
    await presetNameInput.fill(presetName)

    // Click inner Save button.
    await sidePanel.getByRole('button', { name: /^save$/i }).click()

    // Wait for drawer to close (input hidden).
    await expect(presetNameInput).toBeHidden({ timeout: 5000 })

    // Clear the main selector input.
    await mainSelector.clear()

    // Open Load combobox.
    await sidePanel.getByRole('button', { name: /load/i }).click()

    // Select the preset.
    const loadItem = sidePanel.getByRole('option', { name: new RegExp(presetName, 'i') })
    await loadItem.click()

    // After load the main selector input should contain the preset's selector.
    await expect(mainSelector).toHaveValue(selectorValue)
  })

  test('exports scraped data as CSV download', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    // Navigate to real page for scraping.
    const livePage = await context.newPage()
    await livePage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Prepare selector.
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//h2')
    await mainSelector.press('Enter')

    // Press automagic config button
    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Wait for badge.
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Scrape.
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 5000,
    })

    // Open Export dropdown.
    await sidePanel.getByRole('button', { name: /export/i }).click()

    // Initiate CSV download and wait for it.
    const [download] = await Promise.all([
      sidePanel.waitForEvent('download'),
      sidePanel.getByRole('menuitem', { name: /save all as csv/i }).click(),
    ])

    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.csv$/)

    // Check the file headers correspond to the table headers.
    const fileData = await download.path()
    const fileContent = await fs.readFile(fileData, 'utf-8')
    const headers = fileContent
      .split('\n')[0]
      .split(',')
      .map((header) => header.replace(/"/g, ''))

    const uiHeaders = await sidePanel.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('table thead th'))
      // The first two headers are “#” and “Actions”, which arenʼt included in the CSV.
      return ths
        .slice(2)
        .map((th) => th.textContent?.trim() || '')
        .filter(Boolean)
    })
    expect(headers).toEqual(uiHeaders)
  })

  test('shows rescrape indicator when config changes after successful scrape', async ({
    context,
    serviceWorker,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    // Navigate to Wikipedia for testing
    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')

    // Dismiss consent modal
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Load first system preset: "Internal (relative) Links"
    await sidePanel.getByRole('button', { name: /load/i }).click()
    const linksPresetOption = sidePanel.getByRole('option', { name: /internal.*relative.*links/i })
    await linksPresetOption.click()

    // Wait for valid badge after preset loads
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Perform initial scrape to establish baseline
    const scrapeBtn = sidePanel.getByRole('button', { name: /^scrape$/i })
    await scrapeBtn.click()

    // Wait for data table to appear
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 10000,
    })

    const rescrapeIcon = sidePanel.locator('svg.lucide-refresh-ccw')

    // At this point, no rescrape indicator should be visible
    await expect(rescrapeIcon).toBeHidden({ timeout: 2000 })

    // Load second system preset: "Headings (H1-H6)" - this should trigger rescrape indicator
    await sidePanel.getByRole('button', { name: /load/i }).click()
    const headingsPresetOption = sidePanel.getByRole('option', { name: /headings.*h1.*h6/i })
    await headingsPresetOption.click()

    // Wait for new badge
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Verify rescrape indicator appears when config differs from scraped data
    // (button should now contain refresh icon before "Scrape" text)
    await expect(rescrapeIcon).toBeVisible({ timeout: 2000 })

    // Scrape with new config - rescrape indicator should disappear
    await scrapeBtn.click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 10000,
    })
    await expect(rescrapeIcon).toBeHidden({ timeout: 2000 })

    // Load the first preset again - rescrape indicator should appear again
    await sidePanel.getByRole('button', { name: /load/i }).click()
    await linksPresetOption.click()

    // Rescrape indicator should appear since config now differs from current results
    await expect(rescrapeIcon).toBeVisible({ timeout: 2000 })

    // Load the second preset again - indicator should disappear since it matches current results
    await sidePanel.getByRole('button', { name: /load/i }).click()
    await headingsPresetOption.click()

    // Rescrape indicator should disappear since this config matches current results
    await expect(rescrapeIcon).toBeHidden({ timeout: 2000 })

    // Make a small change to trigger indicator again
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//h2')
    await mainSelector.press('Enter')

    // Wait for badge
    await expect(countBadge).toBeVisible({ timeout: 5000 })

    // Rescrape indicator should appear
    await expect(rescrapeIcon).toBeVisible({ timeout: 2000 })

    // Scrape with modified config - indicator should disappear
    await scrapeBtn.click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 10000,
    })
    await expect(rescrapeIcon).toBeHidden({ timeout: 2000 })
  })
})
