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
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Visual Element Picker' }),
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

test.describe('Onboarding Demo Scrape', () => {
  test('triggers demo scrape and displays data in sidepanel after onboarding completion', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    // Set up navigation listener before clicking (navigation happens immediately)
    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click start button to trigger demo
    await startButton.click()

    // Wait for both sidepanel and navigation to complete
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for data table to appear in sidepanel (demo scrape should auto-trigger)
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Verify data table has content
    const dataTable = sidepanelPage.locator('table')
    await expect(dataTable).toBeVisible()

    // Verify table has rows (should have at least 10 rows based on the demo config)
    const rows = dataTable.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(10)

    // Verify expected columns exist
    const headerCells = dataTable.locator('thead th')
    const headers = await headerCells.allTextContents()
    expect(headers).toContain('Rank')
    expect(headers).toContain('Country/Territory')
    expect(headers).toContain('Population')
    expect(headers).toContain('Percentage')
    expect(headers).toContain('Date')

    // Verify first row has data
    const firstRowCells = rows.first().locator('td')
    const firstRowData = await firstRowCells.allTextContents()
    expect(firstRowData.length).toBeGreaterThan(0)
    expect(firstRowData[0]).toBeTruthy() // Rank should have a value
  })

  test('enables visual picker mode after demo scrape completes', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide and start demo
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    await startButton.click()
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for data table to appear (demo scrape completed)
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Look for picker banner, it is in a shadow root, so we use evaluate to check for it
    const pickerActive = await onboardingPage.evaluate(() => {
      // Check for the crosshair cursor class on html element
      return document.documentElement.classList.contains('scrape-similar-picker-active')
    })

    expect(pickerActive).toBe(true)
  })

  test('stores demo scrape config correctly before navigation', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    // Get the tab ID of the onboarding page
    const tabId = await serviceWorker.evaluate(async (onboardingUrl) => {
      const tabs = await chrome.tabs.query({ url: onboardingUrl })
      return tabs[0]?.id
    }, onboardingPage.url())

    expect(tabId).toBeDefined()

    await onboardingPage.bringToFront()

    // Set up a storage listener in the service worker to capture the config as soon as it's written
    const configCapturePromise = serviceWorker.evaluate((tid): Promise<ScrapeConfig> => {
      return new Promise((resolve) => {
        const storageKey = `demo_scrape_pending_${tid}`

        const listener = (
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => {
          if (areaName === 'local' && changes[storageKey]?.newValue) {
            chrome.storage.onChanged.removeListener(listener)
            resolve(changes[storageKey].newValue as ScrapeConfig)
          }
        }

        chrome.storage.onChanged.addListener(listener)
      })
    }, tabId)

    // Click start button to trigger the demo scrape setup
    await startButton.click()

    // Wait for the config to be captured by the storage listener
    const demoConfig = await configCapturePromise

    expect(demoConfig).toBeDefined()
    expect(demoConfig.mainSelector).toContain('wikitable')
    expect(demoConfig.columns).toHaveLength(5)

    // Verify column definitions
    const columns = demoConfig.columns
    expect(columns[0].name).toBe('Rank')
    expect(columns[1].name).toBe('Country/Territory')
    expect(columns[2].name).toBe('Population')
    expect(columns[3].name).toBe('Percentage')
    expect(columns[4].name).toBe('Date')
  })

  test('cleans up demo scrape config after execution', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    // Get the tab ID before navigation
    const tabId = await serviceWorker.evaluate(async (onboardingUrl) => {
      const tabs = await chrome.tabs.query({ url: onboardingUrl })
      return tabs[0]?.id
    }, onboardingPage.url())

    // Set up listeners before clicking
    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click start button
    await startButton.click()

    // Wait for both to complete
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for scrape to complete
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Verify demo config was cleaned up from storage after execution
    const demoConfigAfter = await serviceWorker.evaluate(async (tid) => {
      const result = await chrome.storage.local.get(`demo_scrape_pending_${tid}`)
      return result[`demo_scrape_pending_${tid}`]
    }, tabId)

    expect(demoConfigAfter).toBeUndefined()
  })

  test('demo scrape uses correct XPath selector for Wikipedia table', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    // Set up listeners before clicking
    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click start button
    await startButton.click()

    // Wait for both to complete
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for scrape to complete
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Verify the main selector is displayed in the sidepanel
    const mainSelectorInput = sidepanelPage.locator('#mainSelector')
    const selectorValue = await mainSelectorInput.inputValue()

    // Should be the XPath selector for the Wikipedia table
    expect(selectorValue).toContain('wikitable')
    expect(selectorValue).toContain('position()')
  })

  test('sidepanel shows correct match count for demo scrape', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    // Set up listeners before clicking
    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click start button
    await startButton.click()

    // Wait for both to complete
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for scrape to complete
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Verify the match count badge shows 10 (the demo scrapes top 10 rows)
    const matchCountBadge = sidepanelPage.locator('[data-slot="badge"]').filter({ hasText: /^10$/ })
    await expect(matchCountBadge).toBeVisible()
  })

  test('demo scrape data can be exported to clipboard', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    // Navigate to the last slide
    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
    const startButton = onboardingPage.getByRole('button', { name: /start/i })

    while (!(await startButton.isVisible())) {
      await nextButton.click()
    }

    await onboardingPage.bringToFront()

    // Set up listeners before clicking
    const navigationPromise = onboardingPage.waitForURL(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
    const sidepanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click start button
    await startButton.click()

    // Wait for both to complete
    const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])

    // Wait for scrape to complete
    await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Stub clipboard
    await TestHelpers.stubClipboard(sidepanelPage)

    // Open Export dropdown and click "Copy all to clipboard"
    await sidepanelPage.getByRole('button', { name: /export/i }).click()
    await sidepanelPage.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify data was copied
    const copiedText = await TestHelpers.getCopiedText(sidepanelPage)
    expect(copiedText).toBeTruthy()
    expect(copiedText).not.toBeNull()

    // Verify column headers are present
    expect(copiedText!).toContain('Rank')
    expect(copiedText!).toContain('Country/Territory')
    expect(copiedText!).toContain('Population')

    // Verify TSV format (tab-separated)
    expect(copiedText!).toContain('\t')

    // Verify it includes multiple rows (not just headers)
    const lines = copiedText!.split('\n').filter((line) => line.trim())
    expect(lines.length).toBeGreaterThan(1) // Headers + at least one data row
  })
})
