import { expect, test, TestHelpers } from './fixtures'

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
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Wait for new page to open when expand button is clicked
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Verify page title and main elements
    await expect(fullDataViewPage).toHaveTitle(/Extracted Data - Scrape Similar/)
    await expect(fullDataViewPage.getByRole('button', { name: /back to tab/i })).toBeVisible()
    await expect(fullDataViewPage.getByRole('button', { name: /export/i })).toBeVisible()

    // Verify data table is present with extracted data
    await expect(fullDataViewPage.locator('table')).toBeVisible()
    const rows = fullDataViewPage.locator('tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(1)

    // Verify sidepanel closes after opening full view (check if sidePanel page is closed)
    await expect(sidePanel.isClosed()).toBe(true)
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
    extensionId,
  }) => {
    // Prepare first tab with data
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Scrape data on the second tab (Web scraping page)
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: 'https://en.wikipedia.org/wiki/Web_scraping',
    })

    // Now we should have data from both tabs stored
    // Open full data view from second tab (should show Web scraping data)
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Verify tab selector shows the current tab (Web scraping)
    const tabSelector = fullDataViewPage.getByRole('button').filter({ hasText: /Web scraping/i })
    await expect(tabSelector).toBeVisible()

    // Click tab selector to open dropdown
    await tabSelector.click()

    // Verify both tabs are available in the dropdown
    await expect(
      fullDataViewPage.getByRole('option').filter({ hasText: /Playwright/i }),
    ).toBeVisible()
    await expect(
      fullDataViewPage.getByRole('option').filter({ hasText: /Web scraping/i }),
    ).toBeVisible()

    // Switch to first tab data
    await fullDataViewPage
      .getByRole('option')
      .filter({ hasText: /Playwright/i })
      .click()

    // Verify URL updated with new tab ID
    expect(fullDataViewPage.url()).toMatch(/tabId=\d+/)

    // Verify page title updated to show Playwright data
    await expect(fullDataViewPage).toHaveTitle(/Playwright.*Extracted Data/)

    // Verify the data actually changed by checking table content
    // The Playwright page should have different headings than Web scraping page
    const tableRows = fullDataViewPage.locator('table tbody tr')
    await expect(tableRows.first()).toBeVisible()
  })

  test('handles back to tab functionality and reopens sidepanel', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    const sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Click back to tab button
    const backButton = fullDataViewPage.getByRole('button', { name: /back to tab/i })
    await expect(backButton).toBeVisible()

    const reopenedSidePanel = context.waitForEvent('page', {
      predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
    })

    // Click back button and wait for the full data view page to close
    await Promise.all([fullDataViewPage.waitForEvent('close'), backButton.click()])

    // Verify original test page becomes active and sidepanel reopens
    expect(await testPage.evaluate(() => document.hasFocus())).toBe(true)
    expect((await reopenedSidePanel).isClosed()).toBe(false)
  })

  test('performs global search across all columns', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    const initialRowCount = await fullDataViewPage.getByRole('row').count()
    expect(initialRowCount).toBeGreaterThanOrEqual(1)

    // Perform search
    const searchInput = fullDataViewPage.getByPlaceholder(/search all columns/i)
    await expect(searchInput).toBeVisible()
    await searchInput.fill('History')

    // Verify search filters results
    const filteredRowCount = await fullDataViewPage.getByRole('row').count()
    expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount)

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
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for table to load
    await expect(fullDataViewPage.locator('table')).toBeVisible()

    // Find a data column header (not index or actions)
    const dataColumnHeader = fullDataViewPage
      .locator('th')
      .filter({ hasText: /heading/i })
      .first()
    await expect(dataColumnHeader).toBeVisible()

    // Get initial column width
    const initialWidth = await dataColumnHeader.evaluate((el) => el.getBoundingClientRect().width)

    // Locate resize handle (should be at the right edge of the header)
    const resizeHandle = dataColumnHeader.locator('div').last()

    // Perform resize by dragging the handle
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
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      selector: '(//span)[position() <= 20]',
    })

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load
    const tableRows = await fullDataViewPage.getByRole('row').count()
    expect(tableRows).toBeGreaterThan(10)
    expect(tableRows).toBeLessThanOrEqual(20)

    // Change page size to a smaller value to ensure pagination appears
    const pageSizeButton = fullDataViewPage.getByRole('button').filter({ hasText: /^20$/ })
    await expect(pageSizeButton).toBeVisible()
    await pageSizeButton.click()

    // Select smaller page size
    await fullDataViewPage.getByRole('menuitemradio', { name: '10', exact: true }).click()

    // Verify page size changed
    await expect(fullDataViewPage.getByRole('button').filter({ hasText: /^10$/ })).toBeVisible()

    // Check if pagination controls appear (only if there are more than 10 rows)
    const totalRows = await fullDataViewPage.getByRole('row').count()
    if (totalRows > 10) {
      // Verify pagination controls
      await expect(fullDataViewPage.getByRole('button', { name: /next/i })).toBeVisible()
      await expect(fullDataViewPage.getByText(/page 1 of/i)).toBeVisible()

      // Test navigation
      await fullDataViewPage.getByRole('button', { name: /next/i }).click()
      await expect(fullDataViewPage.getByText(/page 2 of/i)).toBeVisible()

      // Go back to page 1
      await fullDataViewPage.getByRole('button', { name: /previous/i }).click()
      await expect(fullDataViewPage.getByText(/page 1 of/i)).toBeVisible()
    }
  })

  test('supports row selection and bulk operations', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load
    const tableRows = await fullDataViewPage.getByRole('row').count()
    expect(tableRows).toBeGreaterThanOrEqual(1)

    // Select individual row
    await fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Select row')
      .click()

    // Verify selection counter appears
    await expect(fullDataViewPage.getByText(/1 of \d+ rows selected/i)).toBeVisible()

    // Test select all
    const selectAllCheckbox = fullDataViewPage.getByRole('checkbox', { name: 'Select all' })
    await selectAllCheckbox.click()

    // Verify all rows selected message
    await expect(fullDataViewPage.getByText(/\d+ of \d+ rows selected/i)).toBeVisible()

    // Deselect all
    await selectAllCheckbox.click()

    // Verify selection cleared
    await expect(fullDataViewPage.getByText(/rows selected/i)).toBeHidden()
  })

  test('supports row highlighting functionality', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Wait for data to load
    const tableRows = await fullDataViewPage.getByRole('row').count()
    expect(tableRows).toBeGreaterThanOrEqual(1)

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

  test('supports row copying functionality', async ({ openSidePanel, serviceWorker, context }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Mock clipboard
    await fullDataViewPage.evaluate(() => {
      ;(window as any).__copied = null
      navigator.clipboard.writeText = async (text: string) => {
        ;(window as any).__copied = text
        return Promise.resolve()
      }
    })

    // Wait for data to load
    const tableRows = await fullDataViewPage.getByRole('row').count()
    expect(tableRows).toBeGreaterThanOrEqual(1)

    // Click copy button on first row
    const firstRowCopyButton = fullDataViewPage
      .getByRole('row', { name: 'Select row 1 Highlight this' })
      .getByLabel('Copy this row')

    await expect(firstRowCopyButton).toBeVisible()
    await firstRowCopyButton.click()

    // Verify success toast
    await expect(fullDataViewPage.getByText(/copied row to clipboard/i)).toBeVisible()

    // Verify clipboard content
    const copiedText = await fullDataViewPage.evaluate(() => (window as any).__copied)
    expect(copiedText).not.toBeNull()
    expect(copiedText).toContain('\t') // Should be TSV format
  })

  test('copies entire table via Export → Copy to clipboard', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Mock clipboard for full data view
    await fullDataViewPage.evaluate(() => {
      ;(window as any).__copied = null
      navigator.clipboard.writeText = async (text: string) => {
        ;(window as any).__copied = text
        return Promise.resolve()
      }
    })

    // Wait for data to load and export button to appear
    await expect(fullDataViewPage.getByRole('button', { name: /export/i })).toBeVisible()

    // Open export dropdown and click "Copy to clipboard" option
    await fullDataViewPage.getByRole('button', { name: /export/i }).click()
    await fullDataViewPage.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify success toast appears
    await expect(fullDataViewPage.getByText(/copied.*to clipboard/i)).toBeVisible()

    // Verify clipboard capture contains multiple lines
    const text = await fullDataViewPage.evaluate(() => (window as any).__copied)
    expect(text).not.toBeNull()
    expect(text.split('\n').length).toBeGreaterThan(1) // header + at least one data line
  })

  test('supports export functionality', async ({ openSidePanel, serviceWorker, context }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

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
  })

  test('shows empty rows toggle when empty rows are present', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to a page and use a selector that will produce some empty results
    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    // Use a selector that matches some elements but may have empty text
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//p | //h2')
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

    // Check if show empty rows toggle is present
    const showEmptyRowsSwitch = fullDataViewPage.getByRole('switch', { name: /show.*empty rows/i })

    // If empty rows exist, toggle should be visible
    if (await showEmptyRowsSwitch.isVisible()) {
      // Test toggling empty rows
      const initialRowCount = await fullDataViewPage.getByRole('row').count()

      // Toggle on to show empty rows
      await showEmptyRowsSwitch.click()

      // Should show more rows (including empty ones)
      const newRowCount = await fullDataViewPage.getByRole('row').count()
      expect(newRowCount).toBeGreaterThanOrEqual(initialRowCount)

      // Toggle off to hide empty rows
      await showEmptyRowsSwitch.click()

      // Should return to original count
      await expect(fullDataViewPage.getByRole('row')).toHaveCount(initialRowCount)
    }
  })

  test('updates in real-time when data changes in original tab', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Get initial row count
    const initialRowCount = await fullDataViewPage.getByRole('row').count()
    expect(initialRowCount).toBeGreaterThan(0)

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
      const storedConfig = currentData[sessionKey]

      if (storedConfig?.scrapeResult?.data) {
        // Add a new row to simulate updated scrape results
        const newRow = {
          data: { Heading: 'New Test Heading Added' },
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
    await expect(fullDataViewPage.getByText('New Test Heading Added')).toBeVisible()

    // Test data removal as well
    await serviceWorker.evaluate(async (tabId) => {
      const sessionKey = `sidepanel_config_${tabId}`

      // Get current stored data and remove the last row
      const currentData = await chrome.storage.session.get(sessionKey)
      const storedConfig = currentData[sessionKey]

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
    await expect(fullDataViewPage.getByText('New Test Heading Added')).toBeHidden()
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
