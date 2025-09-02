import { BrowserContext, Page, Worker } from '@playwright/test'
import { expect, test } from './fixtures'

/*
 End-to-end tests covering clipboard copy actions in the Data Table.
 We verify both the per-row "Copy" button and the global Export → Copy TSV flow.
*/

// Stub clipboard.writeText to capture copied text.
const stubClipboard = async (sidePanel: Page) => {
  await sidePanel.evaluate(() => {
    ;(window as any).__copied = null
    navigator.clipboard.writeText = async (t) => {
      ;(window as any).__copied = t
      return Promise.resolve()
    }
  })
}

const copiedText = async (sidePanel: Page) => {
  return await sidePanel.evaluate(() => (window as any).__copied)
}

test.describe('Copy to clipboard', () => {
  // Shared helper: prepare the side-panel with scraped data ready.
  const prepareDataTable = async (
    sidePanel: Page,
    serviceWorker: Worker,
    context: BrowserContext,
  ) => {
    // Dismiss analytics consent quickly via storage to avoid modal.
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })

    // Navigate active tab (created by openSidePanel) to a deterministic page.
    const page = await context.newPage()
    await page.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await page.bringToFront()

    // Fill main selector and scrape.
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//h2')
    await mainSelector.press('Enter')

    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Click Scrape button.
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()

    // Wait for the "Extracted Data" heading to appear.
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible()
  }

  test('copies a single row via row action button', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()

    await prepareDataTable(sidePanel, serviceWorker, context)

    await stubClipboard(sidePanel)

    // Click the first "Copy this row" button (ensure it is enabled).
    const copyBtn = sidePanel.getByRole('button', { name: /copy this row/i }).first()
    await expect(copyBtn).toBeEnabled()
    await copyBtn.click()

    // Verify clipboard capture.
    const text = await copiedText(sidePanel)
    expect(text).not.toBeNull()
    expect(text).toContain('\t') // TSV should contain at least one tab
    expect(text).not.toContain('\n') // TSV should not contain newlines
  })

  test('copies entire table via Export → Copy to clipboard', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()

    await prepareDataTable(sidePanel, serviceWorker, context)

    await stubClipboard(sidePanel)

    // Open Export dropdown and click "Copy to clipboard" option.
    await sidePanel.getByRole('button', { name: /export/i }).click()
    await sidePanel.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify clipboard capture contains multiple lines.
    const text = await copiedText(sidePanel)
    expect(text).not.toBeNull()
    expect(text.split('\n').length).toBeGreaterThan(1) // header + at least one data line
  })
})
