import { expect, test, TestHelpers } from './fixtures'

/**
 * Regression test for column-delete index bug.
 *
 * Background: when scraping a table the auto-generated config assigns synthetic keys
 * (col1, col2, col3, ...) to each column. The scraped data is keyed by those synthetic
 * keys. If the user later deletes a column from the config, the *current* config is
 * shorter than the data, but the saved scrapeResult and its column order are unchanged.
 * The data display logic must keep using the producing config (the one that produced the
 * data) for index lookups; otherwise data shifts under the headers.
 */

const TABLE_PAGE_URL = 'https://example.com/scrape-similar-column-delete/'
const TABLE_HTML = `<!doctype html>
<html>
  <head><title>Column Delete Regression</title></head>
  <body>
    <table>
      <thead>
        <tr><th>Alpha</th><th>Beta</th><th>Gamma</th></tr>
      </thead>
      <tbody>
        <tr><td>a1</td><td>b1</td><td>c1</td></tr>
        <tr><td>a2</td><td>b2</td><td>c2</td></tr>
      </tbody>
    </table>
  </body>
</html>`

test.describe('Column delete preserves data alignment', () => {
  test('table data stays aligned with headers after deleting a middle column', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Serve a deterministic table at a real https URL via Playwright route mocking
    const testPage = await context.newPage()
    await testPage.route(TABLE_PAGE_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: TABLE_HTML }),
    )
    await testPage.goto(TABLE_PAGE_URL)
    await testPage.bringToFront()

    // Configure selector targeting the data rows and let auto-generate produce the
    // table-shaped config (synthetic col1/col2/col3 keys with `*[i]` selectors).
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//tbody/tr')
    await mainSelector.press('Enter')
    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Wait for the selector match-count badge before scraping
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible()

    // Scrape and wait for the data table to appear
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 10000,
    })

    // Locate the data table (excluding any other tables, e.g. inside the sidepanel)
    const dataTable = sidePanel.locator('.data-table-container table').first()
    const headerCells = dataTable.locator('thead th')
    const firstDataRow = dataTable.locator('tbody tr').first()
    const firstRowCells = firstDataRow.locator('td')

    // Headers: index 0 = "#", index 1 = "Actions", indexes 2..4 = the data columns.
    await expect(headerCells.nth(2)).toHaveText('Alpha')
    await expect(headerCells.nth(3)).toHaveText('Beta')
    await expect(headerCells.nth(4)).toHaveText('Gamma')

    await expect(firstRowCells.nth(2)).toHaveText('a1')
    await expect(firstRowCells.nth(3)).toHaveText('b1')
    await expect(firstRowCells.nth(4)).toHaveText('c1')

    // Delete the middle column ("Beta") from the config form. Buttons are rendered
    // in column order, so index 1 corresponds to Beta.
    const removeColumnButtons = sidePanel.getByRole('button', { name: 'Remove column' })
    await removeColumnButtons.nth(1).click()

    // Until the user re-scrapes, the data table must continue to render the data using
    // the producing config — otherwise indexes shift and column "Beta" would show
    // Gamma's value while "Gamma" would render empty.
    await expect(headerCells.nth(2)).toHaveText('Alpha')
    await expect(headerCells.nth(3)).toHaveText('Beta')
    await expect(headerCells.nth(4)).toHaveText('Gamma')

    await expect(firstRowCells.nth(2)).toHaveText('a1')
    await expect(firstRowCells.nth(3)).toHaveText('b1')
    await expect(firstRowCells.nth(4)).toHaveText('c1')
  })
})
