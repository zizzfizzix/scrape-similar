import type { ScrapeConfig } from '@/utils/types'
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test'
import { DEMO_TARGET_PAGE_FACTS, DEMO_TARGET_URL, expect, test, TestHelpers } from './fixtures'

/**
 * Onboarding flow tests, including the demo scrape the final slide kicks off.
 *
 * The demo target is baked into the extension rather than into the tests:
 *
 *   - `src/entrypoints/onboarding/OnboardingApp.tsx` navigates to a hard-coded
 *     Wikipedia URL (already branched on `isTest`)
 *   - `src/entrypoints/background/services/demo-scrape.ts` uses a
 *     `wikitable`-specific selector and column set in test mode
 *   - `src/entrypoints/background/listeners/tabs.ts` only fires the pending demo
 *     scrape on a `wikipedia.org/wiki/` URL
 *
 * The extension is built before Playwright starts, so it cannot learn the
 * ephemeral port the fixture server picks per worker (see `fixtures.ts`). The
 * demo therefore keeps navigating to the real article URL, and the specs answer
 * for that URL locally instead: `TestHelpers.mockDemoTargetPage` routes it to
 * `tests/e2e/fixtures/pages/wikitable-demo.html`, which mirrors the shape the
 * baked demo config expects. That keeps the whole suite offline and off
 * Wikipedia's markup (issue #258), with no extension source change - and the
 * fixture's fixed rows let these specs assert exact counts and cell values, the
 * way the fixture-server specs do.
 *
 * Because the mock has to mirror whatever the extension hard-codes, changing the
 * demo target in source means updating the fixture page and
 * DEMO_TARGET_PAGE_FACTS with it.
 */

/** Clicks through the onboarding slides and returns the final slide's Start button. */
const advanceToStartButton = async (onboardingPage: Page): Promise<Locator> => {
  const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
  const startButton = onboardingPage.getByRole('button', { name: /start/i })

  while (!(await startButton.isVisible())) {
    await nextButton.click()
  }

  return startButton
}

/**
 * Clicks Start and waits for both halves of the demo: the side panel opening and
 * the onboarding tab landing on the (locally served) demo page. Both listeners
 * are registered before the click, since navigation happens immediately.
 */
const startDemo = async (
  context: BrowserContext,
  extensionId: string,
  onboardingPage: Page,
  startButton: Locator,
): Promise<Page> => {
  const navigationPromise = onboardingPage.waitForURL(DEMO_TARGET_URL)
  const sidepanelPromise = context.waitForEvent('page', {
    predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
  })

  await startButton.click()

  const [sidepanelPage] = await Promise.all([sidepanelPromise, navigationPromise])
  return sidepanelPage
}

/**
 * Walks the whole flow: dismiss consent, open onboarding, reach the final slide,
 * hit Start. Returns the onboarding tab (now showing the demo page) and the side
 * panel it opened.
 */
const completeOnboardingAndStartDemo = async (
  context: BrowserContext,
  extensionId: string,
  serviceWorker: Worker,
): Promise<{ onboardingPage: Page; sidepanelPage: Page }> => {
  await TestHelpers.dismissAnalyticsConsent(serviceWorker)

  const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)
  const startButton = await advanceToStartButton(onboardingPage)
  await onboardingPage.bringToFront()

  const sidepanelPage = await startDemo(context, extensionId, onboardingPage, startButton)

  return { onboardingPage, sidepanelPage }
}

/** Waits for the auto-triggered demo scrape to render its data in the side panel. */
const waitForDemoData = async (sidepanelPage: Page): Promise<void> => {
  await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()
}

// Serve the local wikitable fixture at the baked demo URL for every spec here.
test.beforeEach(async ({ context }) => {
  await TestHelpers.mockDemoTargetPage(context)
})

test.describe('Onboarding Flow', () => {
  test('completes onboarding flow and opens sidepanel with demo page navigation', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const { onboardingPage, sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Verify the sidepanel opened successfully
    expect(sidepanelPage.isClosed()).toBe(false)

    // Verify the tab landed on the demo target and got the fixture article
    expect(onboardingPage.url()).toBe(DEMO_TARGET_URL)
    await expect(onboardingPage.locator('h1')).toHaveText(
      'List of countries and dependencies by population',
    )

    // Guards DEMO_TARGET_PAGE_FACTS against edits to the fixture page
    await expect(onboardingPage.locator('table.wikitable tbody tr:has(td)')).toHaveCount(
      DEMO_TARGET_PAGE_FACTS.tableRows,
    )
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
    const { sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Wait for data table to appear in sidepanel (demo scrape should auto-trigger)
    await waitForDemoData(sidepanelPage)

    // Verify data table has content
    const dataTable = sidepanelPage.locator('.data-table-container table').first()
    await expect(dataTable).toBeVisible()

    // The demo config caps the selector at the table's first 10 data rows
    const rows = dataTable.locator('tbody tr')
    await expect(rows).toHaveCount(DEMO_TARGET_PAGE_FACTS.scrapedRows)

    // Verify expected columns exist
    const headers = await dataTable.locator('thead th').allTextContents()
    expect(headers).toContain('Rank')
    expect(headers).toContain('Country/Territory')
    expect(headers).toContain('Population')
    expect(headers).toContain('Percentage')
    expect(headers).toContain('Date')

    // Verify the first row holds the fixture's first data row. Cells 0 and 1 are
    // the row-number and actions columns the data table prepends.
    const firstRowCells = rows.first().locator('td')
    for (const [index, value] of DEMO_TARGET_PAGE_FACTS.firstRow.entries()) {
      await expect(firstRowCells.nth(index + 2)).toHaveText(value)
    }

    // The 11th data row must stay out of range
    await expect(rows.last().locator('td').nth(3)).toHaveText(
      DEMO_TARGET_PAGE_FACTS.lastScrapedCountry,
    )
  })

  test('enables visual picker mode after demo scrape completes', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const { onboardingPage, sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Wait for data table to appear (demo scrape completed)
    await waitForDemoData(sidepanelPage)

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

    // Open onboarding page and navigate to the last slide
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)
    const startButton = await advanceToStartButton(onboardingPage)

    await onboardingPage.bringToFront()

    // Set up a storage listener in the service worker to capture the config as soon as it's written
    const configPromise = serviceWorker.evaluate(() => {
      return new Promise<ScrapeConfig>((resolve, reject) => {
        const listener = (
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => {
          if (areaName === 'local') {
            // Look for any demo_scrape_pending key
            for (const key of Object.keys(changes)) {
              if (key.startsWith('demo_scrape_pending_') && changes[key]?.newValue) {
                chrome.storage.onChanged.removeListener(listener)
                resolve(changes[key].newValue as ScrapeConfig)
                return
              }
            }
          }
        }

        chrome.storage.onChanged.addListener(listener)
      })
    })

    // Click start button to trigger the demo scrape setup
    await startButton.click()

    // Wait for the config to be captured by the storage listener
    const demoConfig = await configPromise

    expect(demoConfig).toBeDefined()
    expect(demoConfig.mainSelector).toContain('wikitable')
    expect(demoConfig.columns).toHaveLength(5)

    // Verify column definitions
    const columns = demoConfig.columns
    expect(columns[0]?.name).toBe('Rank')
    expect(columns[1]?.name).toBe('Country/Territory')
    expect(columns[2]?.name).toBe('Population')
    expect(columns[3]?.name).toBe('Percentage')
    expect(columns[4]?.name).toBe('Date')
  })

  test('cleans up demo scrape config after execution', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    // Dismiss analytics consent
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open onboarding page and navigate to the last slide
    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)
    const startButton = await advanceToStartButton(onboardingPage)

    await onboardingPage.bringToFront()

    // Get the tab ID before navigation
    const tabId = await serviceWorker.evaluate(async (onboardingUrl) => {
      const tabs = await chrome.tabs.query({ url: onboardingUrl })
      return tabs[0]?.id
    }, onboardingPage.url())

    const sidepanelPage = await startDemo(context, extensionId, onboardingPage, startButton)

    // Wait for scrape to complete
    await waitForDemoData(sidepanelPage)

    // Verify demo config was cleaned up from storage after execution
    const demoConfigAfter = await serviceWorker.evaluate(async (tid) => {
      const result = await chrome.storage.local.get(`demo_scrape_pending_${tid}`)
      return result[`demo_scrape_pending_${tid}`]
    }, tabId)

    expect(demoConfigAfter).toBeUndefined()
  })

  test('demo scrape uses correct XPath selector for the demo table', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const { sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Wait for scrape to complete
    await waitForDemoData(sidepanelPage)

    // Verify the main selector is displayed in the sidepanel
    const mainSelectorInput = sidepanelPage.locator('#mainSelector')
    const selectorValue = await mainSelectorInput.inputValue()

    // Should be the XPath selector for the wikitable
    expect(selectorValue).toContain('wikitable')
    expect(selectorValue).toContain('position()')
  })

  test('sidepanel shows correct match count for demo scrape', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const { sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Wait for scrape to complete
    await waitForDemoData(sidepanelPage)

    // Verify the match count badge shows the rows the demo scrapes
    const matchCountBadge = sidepanelPage
      .locator('[data-slot="badge"]')
      .filter({ hasText: new RegExp(`^${DEMO_TARGET_PAGE_FACTS.scrapedRows}$`) })
    await expect(matchCountBadge).toBeVisible()
  })

  test('demo scrape data can be exported to clipboard', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const { sidepanelPage } = await completeOnboardingAndStartDemo(
      context,
      extensionId,
      serviceWorker,
    )

    // Wait for scrape to complete
    await waitForDemoData(sidepanelPage)

    // Stub clipboard
    await TestHelpers.stubClipboard(sidepanelPage)

    // Open Export dropdown and click "Copy all to clipboard"
    await sidepanelPage.getByRole('button', { name: /export/i }).click()
    await sidepanelPage.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify data was copied
    const copiedText = await TestHelpers.getCopiedText(sidepanelPage)
    expect(copiedText).toBeTruthy()
    expect(copiedText).not.toBeNull()

    const lines = copiedText!.split('\n').filter((line) => line.trim())

    // One header line plus one line per scraped row
    expect(lines).toHaveLength(DEMO_TARGET_PAGE_FACTS.scrapedRows + 1)

    // TSV format: the demo config's column names, tab separated
    expect(lines[0]).toBe(
      ['Rank', 'Country/Territory', 'Population', 'Percentage', 'Date'].join('\t'),
    )

    // The fixture's first data row, in the same order
    expect(lines[1]).toBe(DEMO_TARGET_PAGE_FACTS.firstRow.join('\t'))
  })
})
