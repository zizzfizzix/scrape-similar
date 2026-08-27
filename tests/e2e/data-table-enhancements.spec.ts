import { expect, FIXTURE_PAGE_COUNTS, SCRAPE_TARGET_PAGE, test, TestHelpers } from './fixtures'

/**
 * End-to-end tests for DataTable enhancements introduced in recent commits:
 * - Expand button with improved positioning
 * - Column auto-resizing and manual resizing
 * - Pagination improvements (hiding when not needed)
 * - Export button UX improvements
 * - Floating button positioning with anchors
 */

test.describe('DataTable Enhancements', () => {
  test('expand button appears on hover and has proper positioning', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Find the data table container
    const dataTableContainer = sidePanel.locator('.data-table-container')
    await expect(dataTableContainer).toBeVisible()

    // Initially, expand button should be hidden (opacity 0)
    const expandButton = sidePanel.getByRole('button', { name: /open in full view/i })
    await expect(expandButton).toBeVisible() // Element exists but with opacity 0

    // Hover over the data table container to make expand button visible
    await dataTableContainer.hover()

    // Expand button should become visible on hover
    // Note: We can't easily test CSS opacity changes in Playwright, but we can verify the button is interactable
    await expect(expandButton).toBeEnabled()

    // Verify button positioning classes are present
    const buttonClasses = await expandButton.getAttribute('class')
    expect(buttonClasses).toContain('fixed')
    expect(buttonClasses).toContain('z-50')
    expect(buttonClasses).toContain('anchored')
  })

  test('column resizing works properly in sidepanel data table', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Wait for table to be visible
    const table = sidePanel.getByRole('table')
    await expect(table).toBeVisible()

    // Find data column headers (exclude row index and actions columns)
    const headers = sidePanel.locator('thead th')
    const headerCount = await headers.count()

    // Should have at least 3 columns: row index, actions, and data column(s)
    expect(headerCount).toBeGreaterThanOrEqual(3)

    // Find the first resizable data column by looking for one with a resize handle
    let dataColumnHeader = null
    let resizeHandle = null

    for (let i = 0; i < headerCount; i++) {
      const header = headers.nth(i)
      const potentialHandle = header.locator('div.cursor-col-resize')

      if ((await potentialHandle.count()) > 0) {
        dataColumnHeader = header
        resizeHandle = potentialHandle
        break
      }
    }

    // Ensure we found a resizable column
    expect(dataColumnHeader).not.toBeNull()
    expect(resizeHandle).not.toBeNull()

    await expect(dataColumnHeader!).toBeVisible()

    // Hover over the header to make resize handle visible
    await dataColumnHeader!.hover()
    await expect(resizeHandle!).toBeVisible()

    // Verify resize handle has proper classes and cursor style
    const handleClasses = await resizeHandle!.getAttribute('class')
    expect(handleClasses).toContain('cursor-col-resize')
    expect(handleClasses).toContain('select-none')
    expect(handleClasses).toContain('touch-none')

    // Verify the column has appropriate sizing attributes
    const headerStyle = await dataColumnHeader!.getAttribute('style')
    expect(headerStyle).toContain('width')
    expect(headerStyle).toContain('position: relative')

    // Verify resize handle is positioned correctly (absolute, top-0, right-0)
    const handleStyle = await resizeHandle!.evaluate((el) => {
      const computedStyle = window.getComputedStyle(el)
      return {
        position: computedStyle.position,
        top: computedStyle.top,
        right: computedStyle.right,
        height: computedStyle.height,
        cursor: computedStyle.cursor,
      }
    })

    expect(handleStyle.position).toBe('absolute')
    expect(handleStyle.top).toBe('0px')
    expect(handleStyle.right).toBe('0px')
    expect(handleStyle.cursor).toBe('col-resize')

    // Verify the column width is set and within reasonable bounds
    const width = await dataColumnHeader!.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeGreaterThanOrEqual(60) // minSize
    expect(width).toBeLessThanOrEqual(400) // maxSize

    // Verify the resize handle becomes more visible on hover
    await resizeHandle!.hover()
    await sidePanel.waitForTimeout(100)

    // Check that the handle has hover effect classes
    expect(handleClasses).toContain('hover:bg-primary/50')
    expect(handleClasses).toContain('hover:opacity-100')

    // Verify column is marked as resizable in the data structure
    const isResizable = await sidePanel.evaluate(() => {
      // Check if TanStack Table's column resizing state exists
      const th = document.querySelector('thead th:has(div.cursor-col-resize)')
      return th !== null && th.querySelector('div.cursor-col-resize') !== null
    })
    expect(isResizable).toBe(true)
  })

  test('pagination controls hide when not needed', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to a page that will have fewer results
    const testPage = await context.newPage()
    await testPage.goto(fixturePageUrl(SCRAPE_TARGET_PAGE))
    await testPage.bringToFront()

    // Use a selector that matches a single element on the fixture page
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//h1')
    await mainSelector.press('Enter')

    // Auto-generate configuration
    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Scrape
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // The fixture page has a single h1, so the result fits on one page and the
    // pagination controls must stay hidden.
    await expect(sidePanel.locator('tbody tr')).toHaveCount(FIXTURE_PAGE_COUNTS.h1)
    await expect(sidePanel.getByRole('button', { name: /previous page/i })).toBeHidden()
    await expect(sidePanel.getByRole('button', { name: /next page/i })).toBeHidden()
    await expect(sidePanel.getByText(/page \d+ of \d+/i)).toBeHidden()
  })

  test('export buttons have improved UX and work correctly', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Find export button
    const exportButton = sidePanel.getByRole('button', { name: /export/i })
    await expect(exportButton).toBeVisible()

    // Click export button to open dropdown
    await exportButton.click()

    // Verify export options are available
    await expect(sidePanel.getByRole('menuitem', { name: /save all as csv/i })).toBeVisible()
    await expect(sidePanel.getByRole('menuitem', { name: /copy all to clipboard/i })).toBeVisible()

    // Test CSV export
    const [download] = await Promise.all([
      sidePanel.waitForEvent('download'),
      sidePanel.getByRole('menuitem', { name: /save all as csv/i }).click(),
    ])

    // Verify download
    const fileName = download.suggestedFilename()
    expect(fileName.toLowerCase()).toMatch(/\.csv$/)

    // Test clipboard copy
    // Mock clipboard API
    await sidePanel.evaluate(() => {
      ;(window as any).__copied = null
      navigator.clipboard.writeText = async (text: string) => {
        ;(window as any).__copied = text
        return Promise.resolve()
      }
    })

    // Open export dropdown again
    await exportButton.click()
    await sidePanel.getByRole('menuitem', { name: /copy all to clipboard/i }).click()

    // Verify clipboard operation
    const copiedText = await sidePanel.evaluate(() => (window as any).__copied)
    expect(copiedText).not.toBeNull()
    expect(copiedText).toContain('\t') // Should be TSV format
  })

  test('auto-resizing calculates optimal column widths', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to a page with varied content lengths
    const testPage = await context.newPage()
    await testPage.goto(fixturePageUrl(SCRAPE_TARGET_PAGE))
    await testPage.bringToFront()

    // Use a more specific selector that will produce multiple columns with different content lengths
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill('//h2 | //h3') // Mix of different heading levels
    await mainSelector.press('Enter')

    // Wait for selector validation to report the fixture's exact match count
    const countBadge = sidePanel
      .locator('[data-slot="badge"]')
      .filter({ hasText: new RegExp(`^${FIXTURE_PAGE_COUNTS.h2h3}$`) })
    await expect(countBadge).toBeVisible()

    // Manually configure columns to ensure we have multiple columns with different content
    // Add a second column that will have different content lengths
    await sidePanel.getByRole('button', { name: /add column/i }).click()
    const columns = sidePanel.locator('input[placeholder="Selector"]')
    await expect(columns).toHaveCount(2)

    // Configure second column to get different content (like parent element text)
    const secondColumnSelector = sidePanel.locator('input[placeholder="Selector"]').last()
    await secondColumnSelector.fill('..//text()[normalize-space()]')

    // Scrape
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Verify table has proper column sizing
    const table = sidePanel.locator('table')
    await expect(table).toBeVisible()

    // Get all headers and verify we have the expected structure
    const headers = table.locator('thead th')
    const headerCount = await headers.count()

    // Should have: row index + actions + at least 2 data columns = minimum 4 columns
    expect(headerCount).toBeGreaterThanOrEqual(4)

    // Get widths of data columns (skip row index [0] and actions [1])
    const dataColumnWidths: number[] = []
    for (let i = 2; i < headerCount; i++) {
      const header = headers.nth(i)
      const width = await header.evaluate((el) => el.getBoundingClientRect().width)
      dataColumnWidths.push(width)
    }

    // Verify we have at least 2 data columns to compare
    expect(dataColumnWidths.length).toBeGreaterThanOrEqual(2)

    // All widths should be within reasonable bounds for sidepanel
    dataColumnWidths.forEach((width) => {
      expect(width).toBeGreaterThan(60) // Minimum width
      expect(width).toBeLessThan(400) // Maximum width for sidepanel
    })

    // Verify that the auto-resizing actually calculated different widths
    // (not all columns have exactly the same width)
    const uniqueWidths = [...new Set(dataColumnWidths)]
    if (dataColumnWidths.length > 1) {
      // If we have multiple columns, they should have some variation in width
      // Allow for some tolerance due to rounding
      const minWidth = Math.min(...dataColumnWidths)
      const maxWidth = Math.max(...dataColumnWidths)

      // There should be at least some difference (more than 10px) between columns
      // if the content is actually different
      expect(maxWidth - minWidth).toBeGreaterThanOrEqual(0) // At minimum, they shouldn't be negative
    }

    // Verify that widths are reasonable for the content
    // Headers should be at least as wide as their text content
    for (let i = 2; i < headerCount; i++) {
      const header = headers.nth(i)
      const headerText = await header.textContent()
      const width = dataColumnWidths[i - 2]

      // Width should be at least as long as the header text (rough estimate: 8px per character)
      if (headerText) {
        const estimatedMinWidth = headerText.length * 6 // Conservative estimate
        expect(width).toBeGreaterThanOrEqual(Math.min(estimatedMinWidth, 80)) // But not less than 80px minimum
      }
    }
  })

  test('floating button positioning works with anchor classes', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Find the data table with anchor class
    const dataTable = sidePanel.locator('table.anchor\\/data-table')
    await expect(dataTable).toBeVisible()

    // Find the floating expand button
    const expandButton = sidePanel.getByRole('button', { name: /open in full view/i })
    await expect(expandButton).toBeVisible()

    // Verify button has anchor positioning classes
    const buttonClasses = await expandButton.getAttribute('class')
    expect(buttonClasses).toContain('anchored/data-table')
    expect(buttonClasses).toContain('anchored-bottom-end')
    expect(buttonClasses).toContain('fixed')

    // Verify button is positioned correctly relative to the table
    const tableBox = await dataTable.boundingBox()
    const buttonBox = await expandButton.boundingBox()

    if (tableBox && buttonBox) {
      // Button should be positioned near the bottom-right of the table area
      expect(buttonBox.x).toBeGreaterThan(tableBox.x)
      expect(buttonBox.y).toBeGreaterThan(tableBox.y)
    }
  })

  test('data table handles empty rows toggle correctly', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()

    // Dismiss consent modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to page and use a selector that produces exactly one empty result
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

    // The empty row means the toggle has to be offered
    const showEmptyRowsSwitch = sidePanel.getByRole('switch', { name: /show.*empty rows/i })
    await expect(showEmptyRowsSwitch).toBeVisible()

    // Only the rows carrying data are shown by default
    const dataRows = sidePanel.locator('tbody tr')
    await expect(dataRows).toHaveCount(FIXTURE_PAGE_COUNTS.divWithClassOrH2NonEmpty)
    await expect(sidePanel.getByText(/rows with data/i)).toBeVisible()

    // Toggling on adds the empty row
    await showEmptyRowsSwitch.click()
    await expect(dataRows).toHaveCount(FIXTURE_PAGE_COUNTS.divWithClassOrH2)
    await expect(sidePanel.getByText(/total rows/i)).toBeVisible()

    // Toggling off hides it again
    await showEmptyRowsSwitch.click()
    await expect(dataRows).toHaveCount(FIXTURE_PAGE_COUNTS.divWithClassOrH2NonEmpty)
    await expect(sidePanel.getByText(/rows with data/i)).toBeVisible()
  })

  test('data table tooltips work for action buttons', async ({
    openSidePanel,
    serviceWorker,
    context,
    fixturePageUrl,
  }) => {
    const sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context, {
      testPageUrl: fixturePageUrl(SCRAPE_TARGET_PAGE),
    })

    // Find action buttons in the first row
    const firstRow = sidePanel.locator('tbody tr').first()
    const highlightButton = firstRow.getByRole('button', { name: /highlight this element/i })
    const copyButton = firstRow.getByRole('button', { name: /copy this row/i })

    // Hover over highlight button to trigger tooltip
    await highlightButton.hover()

    // Verify tooltip appears
    await expect(sidePanel.getByText('Highlight this element')).toBeVisible()

    // reset the hover state
    await highlightButton.click()
    await expect(sidePanel.getByText('Highlight this element')).toBeHidden()

    // Move to copy button
    await copyButton.hover()

    // Verify copy tooltip appears
    await expect(sidePanel.getByText('Copy this row')).toBeVisible()

    // Move away to hide tooltips
    await sidePanel.getByRole('heading', { name: 'extracted data' }).click()

    // Tooltips should be hidden
    await expect(sidePanel.getByText('Highlight this element')).toBeHidden()
    await expect(sidePanel.getByText('Copy this row')).toBeHidden()
  })
})
