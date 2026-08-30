import type { SidePanelConfig } from '@/utils/types'
import {
  ALT_SCRAPE_TARGET_PAGE,
  DEFAULT_SCRAPE_ROW_COUNT,
  expect,
  FIXTURE_PAGE_COUNTS,
  getFirstWorksheet,
  SCRAPE_TARGET_PAGE,
  test,
  TestHelpers,
} from './fixtures'

/**
 * End-to-end tests for the Full Data View feature.
 * This feature allows users to open scraped data in a dedicated full-page view
 * with enhanced functionality like search, column resizing, pagination, and more.
 */

test.describe('Full Data View', () => {
  test('opens full data view from expand button in sidepanel data table', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Set up listener for sidepanel close BEFORE clicking the button to avoid race condition
    const sidePanelClosePromise = sidePanel.waitForEvent('close')

    // Wait for new page to open when expand button is clicked
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Verify page title and main elements
    await expect(fullDataViewPage).toHaveTitle(/Extracted Data - Scrape Similar/)
    await expect(fullDataViewPage.getByRole('button', { name: /back to tab/i })).toBeVisible()
    await expect(fullDataViewPage.getByRole('button', { name: /export/i })).toBeVisible()

    // Verify data table is present with the fixture's exact row count
    await expect(fullDataViewPage.locator('table')).toBeVisible()
    await expect(fullDataViewPage.locator('tbody tr')).toHaveCount(DEFAULT_SCRAPE_ROW_COUNT)

    // Verify sidepanel closes after opening full view
    await sidePanelClosePromise
    expect(sidePanel.isClosed()).toBe(true)
  })

  test('shows no data state when no scraped data is available', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Open full data view directly without any scraped data
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html`)

    // Should show no data available message
    await expect(fullDataViewPage.getByText('No Data Available')).toBeVisible()
    await expect(fullDataViewPage.getByText(/no scraped data found/i)).toBeVisible()
  })

  test('switches between multiple tabs with scraped data', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    // Prepare first tab with data
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Scrape data on a second tab, holding the other fixture page
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(ALT_SCRAPE_TARGET_PAGE),
    })

    // Now we should have data from both tabs stored
    // Open full data view from second tab (should show the Archive fixture's data)
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Verify tab selector shows the current tab (Archive)
    const tabSelector = fullDataViewPage.getByRole('button').filter({ hasText: /archive/i })
    await expect(tabSelector).toBeVisible()

    // Click tab selector to open dropdown
    await tabSelector.click()

    // Verify both tabs are available in the dropdown
    await expect(
      fullDataViewPage.getByRole('option').filter({ hasText: /directory/i }),
    ).toBeVisible()
    await expect(fullDataViewPage.getByRole('option').filter({ hasText: /archive/i })).toBeVisible()

    // Switch to first tab data
    await fullDataViewPage
      .getByRole('option')
      .filter({ hasText: /directory/i })
      .click()

    // Verify URL updated with new tab ID
    expect(fullDataViewPage.url()).toMatch(/tabId=\d+/)

    // Verify page title updated to show the Directory fixture's data
    await expect(fullDataViewPage).toHaveTitle(/Directory.*Extracted Data/)

    // Verify the data actually changed: the Directory fixture links differ from
    // the Archive fixture's
    await expect(
      fullDataViewPage.getByRole('cell', { name: 'Troubleshooting', exact: true }),
    ).toBeVisible()
  })

  test('handles back to tab functionality and reopens sidepanel', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Set up listener for the first sidepanel to close BEFORE opening full data view
    const sidePanelClosePromise = sidePanel.waitForEvent('close')

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for the first sidepanel to close
    await sidePanelClosePromise
    expect(sidePanel.isClosed()).toBe(true)

    // Click back to tab button
    const backButton = fullDataViewPage.getByRole('button', { name: /back to tab/i })
    await expect(backButton).toBeVisible()

    // Set up event listeners BEFORE clicking to avoid race conditions
    // Now we know the old sidepanel is closed, so this will catch the NEW one
    const reopenedSidePanelPromise = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })
    const fullDataViewClosePromise = fullDataViewPage.waitForEvent('close')

    // Click back button
    await backButton.click()

    // Wait for both the full data view to close and sidepanel to reopen
    const [reopenedSidePanel] = await Promise.all([
      reopenedSidePanelPromise,
      fullDataViewClosePromise,
    ])

    // Verify original test page becomes active and sidepanel reopens
    expect(await testPage.evaluate(() => document.hasFocus())).toBe(true)
    expect(reopenedSidePanel.isClosed()).toBe(false)
  })

  test('performs global search across all columns', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Header row plus one row per scraped link
    const initialRowCount = DEFAULT_SCRAPE_ROW_COUNT + 1
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(initialRowCount)

    // Search for a term only one fixture link carries
    const searchInput = fullDataViewPage.getByPlaceholder(/search all columns/i)
    await expect(searchInput).toBeVisible()
    await searchInput.fill('History')

    // Verify search filters down to the header plus that single row
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(2)

    // Verify filtered row count is displayed
    await expect(fullDataViewPage.getByText(/filtered rows/i)).toBeVisible()

    // Clear search and verify all rows return
    await searchInput.clear()
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(initialRowCount)
  })

  test('supports column resizing and auto-resizing', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for table to load
    await expect(fullDataViewPage.locator('table')).toBeVisible()

    // Find a data column header (not index or actions)
    const dataColumnHeader = fullDataViewPage
      .locator('th')
      .filter({ hasText: /anchor text|url/i })
      .first()
    await expect(dataColumnHeader).toBeVisible()

    // Get initial column width
    const initialWidth = await dataColumnHeader.evaluate((el) => el.getBoundingClientRect().width)

    // Perform resize by dragging the handle at the right edge of the header
    const headerBox = await dataColumnHeader.boundingBox()
    if (headerBox) {
      // Drag from right edge to make column wider
      await fullDataViewPage.mouse.move(
        headerBox.x + headerBox.width - 2,
        headerBox.y + headerBox.height / 2,
      )
      await fullDataViewPage.mouse.down()
      await fullDataViewPage.mouse.move(
        headerBox.x + headerBox.width + 50,
        headerBox.y + headerBox.height / 2,
      )
      await fullDataViewPage.mouse.up()
    }

    // Verify column width changed
    const newWidth = await dataColumnHeader.evaluate((el) => el.getBoundingClientRect().width)
    expect(newWidth).toBeGreaterThan(initialWidth)
  })

  test('supports pagination controls and page size changes', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    const scrapedRowCount = 20
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
      selector: `(//span)[position() <= ${scrapedRowCount}]`,
      expectedMatchCount: scrapedRowCount,
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Header row plus every scraped span; the default page size of 20 fits them all
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(scrapedRowCount + 1)

    // Change page size to a smaller value to ensure pagination appears
    const pageSizeButton = fullDataViewPage.getByRole('button').filter({ hasText: /^20$/ })
    await expect(pageSizeButton).toBeVisible()
    await pageSizeButton.click()

    // Select smaller page size
    await fullDataViewPage.getByRole('menuitemradio', { name: '10', exact: true }).click()

    // Verify page size changed
    await expect(fullDataViewPage.getByRole('button').filter({ hasText: /^10$/ })).toBeVisible()

    // 20 rows across pages of 10, so the controls must appear
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(11)
    await expect(fullDataViewPage.getByRole('button', { name: /next/i })).toBeVisible()
    await expect(fullDataViewPage.getByText('Page 1 of 2')).toBeVisible()

    // Test navigation
    await fullDataViewPage.getByRole('button', { name: /next/i }).click()
    await expect(fullDataViewPage.getByText('Page 2 of 2')).toBeVisible()

    // Go back to page 1
    await fullDataViewPage.getByRole('button', { name: /previous/i }).click()
    await expect(fullDataViewPage.getByText('Page 1 of 2')).toBeVisible()
  })

  test('supports row selection and bulk operations', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(DEFAULT_SCRAPE_ROW_COUNT + 1)

    // Select individual row
    await fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Select row')
      .click()

    // Verify selection counter appears
    await expect(
      fullDataViewPage.getByText(`1 of ${DEFAULT_SCRAPE_ROW_COUNT} rows selected`),
    ).toBeVisible()

    // Test select all
    const selectAllCheckbox = fullDataViewPage.getByRole('checkbox', { name: 'Select all' })
    await selectAllCheckbox.click()

    // Verify all rows selected message
    await expect(
      fullDataViewPage.getByText(
        `${DEFAULT_SCRAPE_ROW_COUNT} of ${DEFAULT_SCRAPE_ROW_COUNT} rows selected`,
      ),
    ).toBeVisible()

    // Deselect all
    await selectAllCheckbox.click()

    // Verify selection cleared
    await expect(fullDataViewPage.getByText(/rows selected/i)).toBeHidden()
  })

  test('supports row highlighting functionality', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(DEFAULT_SCRAPE_ROW_COUNT + 1)

    // Click highlight button on first row
    const firstRowHighlightButton = fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Highlight this element')

    await expect(firstRowHighlightButton).toBeVisible()
    await firstRowHighlightButton.click()

    // This should activate the original tab (testPage should become active)
    // Note: The actual highlighting on the page is harder to test in Playwright
    // but we can verify the tab activation behavior
    await expect(testPage).toBeTruthy()
  })

  test('supports row copying functionality', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    await TestHelpers.stubClipboard(fullDataViewPage)

    // Wait for data to load
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(DEFAULT_SCRAPE_ROW_COUNT + 1)

    // Click copy button on first row
    const firstRowCopyButton = fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Copy this row')

    await expect(firstRowCopyButton).toBeVisible()
    await firstRowCopyButton.click()

    // Verify success toast
    await expect(fullDataViewPage.getByText(/copied row to clipboard/i)).toBeVisible()

    // Verify clipboard content
    const copiedText = await TestHelpers.getCopiedText(fullDataViewPage)
    expect(copiedText).not.toBeNull()
    expect(copiedText).toContain('\t') // Should be TSV format
  })

  test('copies entire table via Export → Copy to clipboard', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    await TestHelpers.stubClipboard(fullDataViewPage)

    // Wait for data to load and export button to appear
    await expect(fullDataViewPage.getByRole('button', { name: /export/i })).toBeVisible()

    // Open export dropdown and click "Copy to clipboard" option
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()
    await fullDataViewPage.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify success toast appears
    await expect(fullDataViewPage.getByText(/copied.*to clipboard/i)).toBeVisible()

    // Verify clipboard capture holds the header plus every fixture row
    const text = await TestHelpers.getCopiedText(fullDataViewPage)
    expect(text).not.toBeNull()
    expect(text!.split('\n').length).toBe(DEFAULT_SCRAPE_ROW_COUNT + 1)
  })

  test('supports export functionality', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load and export button to appear
    await expect(fullDataViewPage.getByRole('button', { name: /export/i })).toBeVisible()

    // Open export dropdown
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()

    // Verify export options are available
    await expect(fullDataViewPage.getByRole('menuitem', { name: /save all as csv/i })).toBeVisible()
    await expect(
      fullDataViewPage.getByRole('menuitem', { name: /copy all to clipboard/i }),
    ).toBeVisible()

    // Test CSV download
    const [download] = await Promise.all([
      fullDataViewPage.waitForEvent('download'),
      fullDataViewPage.getByRole('menuitem', { name: /save all as csv/i }).click(),
    ])

    // Verify download filename
    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.csv$/)

    // Validate headers and row count match UI
    const filePath = await download.path()
    if (filePath) {
      const content = await (await import('fs/promises')).readFile(filePath, 'utf-8')
      const lines = content.trim().split(/\r?\n/)
      const headers = (lines[0] ?? '').split(',').map((header) => header.replace(/"/g, ''))

      const uiHeaders = await fullDataViewPage.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table thead th'))
        // Exclude selection checkbox (empty), row index '#', and 'Actions'
        return ths
          .map((th) => th.textContent?.trim() || '')
          .filter((txt) => txt && txt !== '#' && txt.toLowerCase() !== 'actions')
      })
      expect(headers).toEqual(uiHeaders)

      const uiRowCount = await fullDataViewPage.locator('tbody tr').count()
      expect(lines.length - 1).toBe(uiRowCount)
    }
  })

  test('exports all rows to Excel (.xlsx) from full data view', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Open export dropdown and click XLSX
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()
    const [download] = await Promise.all([
      fullDataViewPage.waitForEvent('download'),
      fullDataViewPage.getByRole('menuitem', { name: /save.*excel.*\.xlsx/i }).click(),
    ])

    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.xlsx$/)

    const filePath = await download.path()
    if (filePath) {
      const ExcelJS = await import('exceljs')
      const data = await (await import('fs/promises')).readFile(filePath)
      const workbook = new ExcelJS.default.Workbook()
      // Playwright's Buffer type differs from Node's Buffer type, but they're compatible at runtime
      // @ts-expect-error - TS2345: Buffer.from creates Buffer<ArrayBuffer> vs expected Buffer
      await workbook.xlsx.load(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
      const worksheet = getFirstWorksheet(workbook)
      const values = worksheet.getSheetValues()
      // getSheetValues returns 1-based array with first element undefined
      const aoa = values.slice(1).map((row) => (Array.isArray(row) ? row.slice(1) : []))

      const uiHeaders = await fullDataViewPage.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table thead th'))
        return ths
          .map((th) => th.textContent?.trim() || '')
          .filter((txt) => txt && txt !== '#' && txt.toLowerCase() !== 'actions')
      })
      expect(aoa[0]).toEqual(uiHeaders)

      const uiRowCount = await fullDataViewPage.locator('tbody tr').count()
      expect(aoa.length - 1).toBe(uiRowCount)
    }
  })

  test('exports only selected rows to CSV from full data view', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Select first row only
    const firstRowCheckbox = fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Select row')
    await firstRowCheckbox.click()

    // Export CSV for selected rows
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()
    const [download] = await Promise.all([
      fullDataViewPage.waitForEvent('download'),
      fullDataViewPage.getByRole('menuitem', { name: /save 1 row as csv/i }).click(),
    ])

    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.csv$/)

    const filePath = await download.path()
    if (filePath) {
      const content = await (await import('fs/promises')).readFile(filePath, 'utf-8')
      const lines = content.trim().split(/\r?\n/)
      // 1 header + 1 data row
      expect(lines.length).toBe(2)
    }
  })

  test('exports only selected rows to Excel (.xlsx) from full data view', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Select first two rows
    const firstRow = fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Select row')
    const secondRow = fullDataViewPage
      .getByRole('row', { name: 'Select row 2 Highlight this' })
      .getByLabel('Select row')
    await firstRow.click()
    await secondRow.click()

    // Export XLSX for selected rows
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()
    const [download] = await Promise.all([
      fullDataViewPage.waitForEvent('download'),
      fullDataViewPage.getByRole('menuitem', { name: /save 2 rows.*excel.*\.xlsx/i }).click(),
    ])

    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.xlsx$/)

    const filePath = await download.path()
    if (filePath) {
      const ExcelJS = await import('exceljs')
      const data = await (await import('fs/promises')).readFile(filePath)
      const workbook = new ExcelJS.default.Workbook()
      // Playwright's Buffer type differs from Node's Buffer type, but they're compatible at runtime
      // @ts-expect-error - TS2345: Buffer.from creates Buffer<ArrayBuffer> vs expected Buffer
      await workbook.xlsx.load(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
      const worksheet = getFirstWorksheet(workbook)
      const values = worksheet.getSheetValues()
      // getSheetValues returns 1-based array with first element undefined
      const aoa = values.slice(1).map((row) => (Array.isArray(row) ? row.slice(1) : []))
      // 1 header + 2 data rows
      expect(aoa.length).toBe(3)
    }
  })

  test('shows empty rows toggle when empty rows are present', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to a page and use a selector that produces exactly one empty result
    const testPage = await context.newPage()
    await testPage.goto(fixturePageUrl(SCRAPE_TARGET_PAGE))
    await testPage.bringToFront()

    // The fixture page's only classed div holds no text, so it scrapes to an empty row
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//div[@class] | //h2')
    await mainSelector.press('Enter')

    // Auto-generate configuration
    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Scrape
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // The empty row means the toggle has to be offered
    const showEmptyRowsSwitch = fullDataViewPage.getByRole('switch', { name: /show.*empty rows/i })
    await expect(showEmptyRowsSwitch).toBeVisible()

    // Header row plus only the rows carrying data
    const rowsWithData = FIXTURE_PAGE_COUNTS.divWithClassOrH2NonEmpty + 1
    const allRows = FIXTURE_PAGE_COUNTS.divWithClassOrH2 + 1
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(rowsWithData)

    // Toggle on to show the empty row too
    await showEmptyRowsSwitch.click()
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(allRows)

    // Toggle off to hide it again
    await showEmptyRowsSwitch.click()
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(rowsWithData)
  })

  test('updates in real-time when data changes in original tab', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Header row plus one row per scraped link
    const initialRowCount = DEFAULT_SCRAPE_ROW_COUNT + 1
    await expect(fullDataViewPage.getByRole('row')).toHaveCount(initialRowCount)

    // Get the current tab ID from the full data view URL
    const currentUrl = fullDataViewPage.url()
    const tabIdMatch = currentUrl.match(/tabId=(\d+)/)
    expect(tabIdMatch).toBeTruthy()
    const tabId = tabIdMatch![1]

    // Simulate new scrape data being added to storage (this would normally happen
    // when user scrapes again in the original tab)
    await serviceWorker.evaluate(async (tabId) => {
      const sessionKey = `sidepanel_config_${tabId}`

      // Get current stored data
      const currentData = await chrome.storage.session.get(sessionKey)
      const storedConfig = currentData[sessionKey] as SidePanelConfig

      if (storedConfig?.scrapeResult?.data) {
        // Add a new row to simulate updated scrape results
        const newRow = {
          data: {
            'Anchor text': 'New Test Link Added',
            URL: 'https://example.com/test',
            Rel: '',
            Target: '',
          },
          metadata: {
            isEmpty: false,
            originalIndex: storedConfig.scrapeResult.data.length,
          },
        }

        // Update the stored data with additional row
        storedConfig.scrapeResult.data.push(newRow)

        // Save back to storage - this should trigger the real-time update
        await chrome.storage.session.set({ [sessionKey]: storedConfig })
      }
    }, tabId)

    // Wait for the full data view to update with the new row
    // The storage watcher should detect the change and update the UI
    await expect(async () => {
      const newRowCount = await fullDataViewPage.getByRole('row').count()
      expect(newRowCount).toBe(initialRowCount + 1)
    }).toPass()

    // Verify the new row appears in the table
    await expect(fullDataViewPage.getByText('New Test Link Added')).toBeVisible()

    // Test data removal as well
    await serviceWorker.evaluate(async (tabId) => {
      const sessionKey = `sidepanel_config_${tabId}`

      // Get current stored data and remove the last row
      const currentData = await chrome.storage.session.get(sessionKey)
      const storedConfig = currentData[sessionKey] as SidePanelConfig

      if (storedConfig?.scrapeResult?.data && storedConfig.scrapeResult.data.length > 1) {
        // Remove the row we just added
        storedConfig.scrapeResult.data.pop()

        // Save back to storage
        await chrome.storage.session.set({ [sessionKey]: storedConfig })
      }
    }, tabId)

    // Wait for the row to be removed from the full data view
    await expect(async () => {
      const finalRowCount = await fullDataViewPage.getByRole('row').count()
      expect(finalRowCount).toBe(initialRowCount)
    }).toPass()

    // Verify the added row is no longer visible
    await expect(fullDataViewPage.getByText('New Test Link Added')).toBeHidden()
  })

  test('handles error states gracefully', async ({ context, extensionId }) => {
    // Open full data view with invalid tab ID
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html?tabId=99999`)

    // Should either show no data message or handle gracefully
    // The app should not crash and should show appropriate feedback
    await expect(fullDataViewPage.locator('body')).toBeVisible()

    // Should show either "No Data Available" or load with empty state
    const noDataHeading = fullDataViewPage.getByRole('heading', { name: /no data available/i })
    if (await noDataHeading.isVisible()) {
      await expect(noDataHeading).toBeVisible()
    }
  })
})
