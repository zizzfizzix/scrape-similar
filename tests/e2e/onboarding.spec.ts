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

const advanceToStartButton = async (onboardingPage: Page): Promise<Locator> => {
  const nextButton = onboardingPage.getByRole('button', { name: 'Next' })
  const startButton = onboardingPage.getByRole('button', { name: /start/i })

  while (!(await startButton.isVisible())) {
    await nextButton.click()
  }

  return startButton
}

/**
 * Both listeners have to be registered before the click: the side panel opens
 * and the tab navigates immediately.
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

/** The returned onboarding tab is already showing the demo page. */
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

const waitForDemoData = async (sidepanelPage: Page): Promise<void> => {
  await expect(sidepanelPage.getByRole('heading', { name: /extracted data/i })).toBeVisible()
}

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

    expect(sidepanelPage.isClosed()).toBe(false)

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
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)

    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Get Started' }),
    ).toBeVisible()

    const nextButton = onboardingPage.getByRole('button', { name: 'Next' })

    await nextButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Pin the Extension' }),
    ).toBeVisible()

    await nextButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Visual Element Picker' }),
    ).toBeVisible()

    const previousButton = onboardingPage.getByRole('button', { name: /previous/i })
    await previousButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Pin the Extension' }),
    ).toBeVisible()

    await previousButton.click()
    await expect(
      onboardingPage.locator('[data-slot="card-title"]', { hasText: 'Get Started' }),
    ).toBeVisible()

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

    await waitForDemoData(sidepanelPage)

    const dataTable = sidepanelPage.locator('.data-table-container table').first()
    await expect(dataTable).toBeVisible()

    // The demo config caps the selector at the table's first 10 data rows
    const rows = dataTable.locator('tbody tr')
    await expect(rows).toHaveCount(DEMO_TARGET_PAGE_FACTS.scrapedRows)

    const headers = await dataTable.locator('thead th').allTextContents()
    expect(headers).toContain('Rank')
    expect(headers).toContain('Country/Territory')
    expect(headers).toContain('Population')
    expect(headers).toContain('Percentage')
    expect(headers).toContain('Date')

    // Cells 0 and 1 are the row-number and actions columns the data table
    // prepends.
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

    await waitForDemoData(sidepanelPage)

    // The picker's banner lives in a shadow root, so check the class it puts on
    // the document element instead.
    const isPickerActive = await onboardingPage.evaluate(() => {
      return document.documentElement.classList.contains('scrape-similar-picker-active')
    })

    expect(isPickerActive).toBe(true)
  })

  test('stores demo scrape config correctly before navigation', async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)
    const startButton = await advanceToStartButton(onboardingPage)

    await onboardingPage.bringToFront()

    // The config is cleared as soon as the demo runs, so catch the write itself
    // rather than reading the key afterwards.
    const configPromise = serviceWorker.evaluate(() => {
      return new Promise<ScrapeConfig>((resolve) => {
        const listener = (
          changes: Record<string, chrome.storage.StorageChange>,
          areaName: string,
        ) => {
          if (areaName === 'local') {
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

    await startButton.click()

    const demoConfig = await configPromise

    expect(demoConfig).toBeDefined()
    expect(demoConfig.mainSelector).toContain('wikitable')
    expect(demoConfig.columns).toHaveLength(5)

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
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    const onboardingPage = await TestHelpers.openOnboardingPage(context, extensionId)
    const startButton = await advanceToStartButton(onboardingPage)

    await onboardingPage.bringToFront()

    // The tab is looked up by its onboarding URL, which the demo is about to
    // replace.
    const tabId = await serviceWorker.evaluate(async (onboardingUrl) => {
      const tabs = await chrome.tabs.query({ url: onboardingUrl })
      return tabs[0]?.id
    }, onboardingPage.url())

    const sidepanelPage = await startDemo(context, extensionId, onboardingPage, startButton)

    await waitForDemoData(sidepanelPage)

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

    await waitForDemoData(sidepanelPage)

    const mainSelectorInput = sidepanelPage.locator('#mainSelector')
    const selectorValue = await mainSelectorInput.inputValue()

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

    await waitForDemoData(sidepanelPage)

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

    await waitForDemoData(sidepanelPage)

    await TestHelpers.stubClipboard(sidepanelPage)

    await sidepanelPage.getByRole('button', { name: /export/i }).click()
    await sidepanelPage.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    const copiedText = await TestHelpers.getCopiedText(sidepanelPage)
    expect(copiedText).toBeTruthy()
    expect(copiedText).not.toBeNull()

    const lines = copiedText!.split('\n').filter((line) => line.trim())

    // One header line plus one line per scraped row
    expect(lines).toHaveLength(DEMO_TARGET_PAGE_FACTS.scrapedRows + 1)

    expect(lines[0]).toBe(
      ['Rank', 'Country/Territory', 'Population', 'Percentage', 'Date'].join('\t'),
    )

    expect(lines[1]).toBe(DEMO_TARGET_PAGE_FACTS.firstRow.join('\t'))
  })
})
