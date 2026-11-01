import type { BrowserContext, Page, Worker } from '@playwright/test'
import {
  ALT_SCRAPE_TARGET_PAGE,
  expect,
  FIXTURE_PAGE_COUNTS,
  SCRAPE_TARGET_PAGE,
  test,
  TestHelpers,
} from './fixtures'

/**
 * The side panel keeps a live panel per tab and hides the inactive ones, which
 * stay in the DOM. Locators here are scoped to what is on screen, so a hidden
 * tab's copy of a field never satisfies (or ambiguates) an assertion.
 */
const shown = (sidePanel: Page, selector: string) => sidePanel.locator(`${selector}:visible`)

/** What an open modal overlay does to the rest of the panel document. */
const readPageLocks = (sidePanel: Page) =>
  sidePanel.evaluate(() => ({
    pointerEvents: document.body.style.pointerEvents,
    isScrollLocked: document.body.hasAttribute('data-scroll-locked'),
    ariaHiddenCount: document.querySelectorAll('body > [aria-hidden="true"]').length,
  }))

const NO_PAGE_LOCKS = { pointerEvents: '', isScrollLocked: false, ariaHiddenCount: 0 }

const openTwoTabs = async ({
  context,
  serviceWorker,
  openSidePanel,
  fixturePageUrl,
}: {
  context: BrowserContext
  serviceWorker: Worker
  openSidePanel: () => Promise<Page>
  fixturePageUrl: (page: string) => string
}) => {
  await TestHelpers.dismissAnalyticsConsent(serviceWorker)
  const sidePanel = await openSidePanel()
  const tabA = await context.newPage()
  await tabA.goto(fixturePageUrl(SCRAPE_TARGET_PAGE))
  const tabB = await context.newPage()
  await tabB.goto(fixturePageUrl(ALT_SCRAPE_TARGET_PAGE))
  await tabA.bringToFront()
  return { sidePanel, tabA, tabB }
}

test.describe('One side panel per tab', () => {
  test('an open save drawer stays with its tab and does not block the other one', async ({
    context,
    serviceWorker,
    openSidePanel,
    fixturePageUrl,
  }) => {
    const { sidePanel, tabA, tabB } = await openTwoTabs({
      context,
      serviceWorker,
      openSidePanel,
      fixturePageUrl,
    })
    const mainSelector = shown(sidePanel, '#mainSelector')
    await mainSelector.fill('//h2')
    await mainSelector.press('Enter')
    await expect(
      sidePanel
        .locator('[data-slot="badge"]:visible')
        .filter({ hasText: new RegExp(`^${FIXTURE_PAGE_COUNTS.h2}$`) }),
    ).toBeVisible()

    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .first()
      .click()
    const presetName = shown(sidePanel, 'input[placeholder="Preset name"]')
    await presetName.fill('Kept with tab A')
    expect((await readPageLocks(sidePanel)).pointerEvents).toBe('none')

    await tabB.bringToFront()

    await expect(presetName).toHaveCount(0)
    await expect(mainSelector).toHaveValue('')
    expect(await readPageLocks(sidePanel)).toEqual(NO_PAGE_LOCKS)
    // Nothing from tab A's drawer intercepts the click.
    await mainSelector.click()
    await mainSelector.fill('//p')
    await expect(mainSelector).toHaveValue('//p')

    await tabA.bringToFront()

    await expect(presetName).toHaveValue('Kept with tab A')
    await expect(mainSelector).toHaveValue('//h2')
  })

  test('an open preset list and an uncommitted draft stay with their tab', async ({
    context,
    serviceWorker,
    openSidePanel,
    fixturePageUrl,
  }) => {
    const { sidePanel, tabA, tabB } = await openTwoTabs({
      context,
      serviceWorker,
      openSidePanel,
      fixturePageUrl,
    })
    const mainSelector = shown(sidePanel, '#mainSelector')
    await mainSelector.fill('//li')

    await sidePanel.getByRole('button', { name: /^load$/i }).click()
    const presetOptions = sidePanel.getByRole('option')
    await expect(presetOptions.first()).toBeVisible()

    await tabB.bringToFront()

    await expect(presetOptions).toHaveCount(0)
    await expect(mainSelector).toHaveValue('')
    expect(await readPageLocks(sidePanel)).toEqual(NO_PAGE_LOCKS)

    await tabA.bringToFront()

    await expect(presetOptions.first()).toBeVisible()
    await expect(mainSelector).toHaveValue('//li')
  })

  test('the results page stays with its tab', async ({
    context,
    serviceWorker,
    openSidePanel,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    const tabA = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
      selector: '//span',
      expectedMatchCount: FIXTURE_PAGE_COUNTS.span,
    })
    const pageCount = Math.ceil(FIXTURE_PAGE_COUNTS.span / 10)
    await sidePanel.getByRole('button', { name: 'Next page' }).click()
    await expect(sidePanel.getByText(`Page 2 of ${pageCount}`)).toBeVisible()

    const tabB = await context.newPage()
    await tabB.goto(fixturePageUrl(ALT_SCRAPE_TARGET_PAGE))
    await tabB.bringToFront()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeHidden()

    await tabA.bringToFront()

    await expect(sidePanel.getByText(`Page 2 of ${pageCount}`)).toBeVisible()
  })
})
