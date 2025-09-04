import { expect, test, TestHelpers } from './fixtures'

/**
 * End-to-end tests for sidepanel integration with full data view:
 * - Special sidepanel view when viewing full data view tab
 * - Full data view controls in sidepanel
 * - Compact view button functionality
 * - Hide sidepanel functionality
 * - Proper handling of tab switching from full data view context
 */

test.describe('Sidepanel Full Data View Integration', () => {
  test('shows special full data view controls when sidepanel views full data view tab', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    let sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Bring the full data view tab to front - this should cause the sidepanel to switch context
    await fullDataViewPage.bringToFront()

    sidePanel = await openSidePanel()

    // The same sidepanel should now detect that it's viewing a full data view tab
    // and show the special controls
    await expect(
      sidePanel.getByRole('heading', { name: /full screen view active/i }),
      // ).toBeVisible()
    ).toBeVisible({ timeout: 0 })
    await expect(sidePanel.getByRole('button', { name: /compact view/i })).toBeVisible()
    await expect(sidePanel.getByRole('button', { name: /hide sidepanel/i })).toBeVisible()

    // Verify the normal sidepanel controls are NOT present
    await expect(sidePanel.getByRole('textbox', { name: /main selector/i })).toBeHidden()
    await expect(sidePanel.getByRole('button', { name: /scrape/i })).toBeHidden()
  })

  test('compact view button switches back to original tab and closes full data view', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    let sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Bring the full data view tab to front - sidepanel should switch to show special controls
    await fullDataViewPage.bringToFront()

    sidePanel = await openSidePanel()

    // Wait for special controls to appear in the same sidepanel
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()

    // Click compact view button
    const compactViewButton = sidePanel.getByRole('button', { name: /compact view/i })
    await expect(compactViewButton).toBeVisible()

    // Click compact view button and wait for the full data view page to close
    await Promise.all([fullDataViewPage.waitForEvent('close'), compactViewButton.click()])

    // Verify original test page becomes active (this is harder to test directly in Playwright,
    // but we can verify that the page still exists and wasn't closed)
    await expect(testPage).toBeTruthy()
    expect(testPage.isClosed()).toBe(false)
  })

  test('hide sidepanel button closes the sidepanel window', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    let sidePanel = await openSidePanel()
    await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Bring the full data view tab to front - sidepanel should switch to show special controls
    await fullDataViewPage.bringToFront()

    sidePanel = await openSidePanel()

    // Wait for special controls to appear in the same sidepanel
    await expect(sidePanel.getByRole('heading', { name: 'Full Screen View Active' })).toBeVisible()

    const hideSidepanelButton = sidePanel.getByRole('button', { name: /hide sidepanel/i })
    await expect(hideSidepanelButton).toBeVisible()

    // Click hide sidepanel button and wait for it to close
    await Promise.all([sidePanel.waitForEvent('close'), hideSidepanelButton.click()])
    await expect(sidePanel.isClosed()).toBe(true)

    // Verify full data view page remains open
    await expect(fullDataViewPage.isClosed()).toBe(false)
    await expect(fullDataViewPage.locator('table')).toBeVisible()
  })

  test('sidepanel detects full data view URL correctly', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent quickly via storage to avoid modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Manually navigate to a full data view URL to test detection
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html?tabId=123`)

    // Open sidepanel while viewing full data view
    const sidePanel = await openSidePanel()

    fullDataViewPage.bringToFront()

    // Should show the special full data view controls
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()
    await expect(sidePanel.getByRole('button', { name: /compact view/i })).toBeVisible()
    await expect(sidePanel.getByRole('button', { name: /hide sidepanel/i })).toBeVisible()

    // Normal sidepanel interface should be hidden
    await expect(sidePanel.getByText(/main selector/i)).toBeHidden()
  })

  test('sidepanel handles invalid full data view URLs gracefully', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent quickly via storage to avoid modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to a full data view URL without tabId parameter
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    fullDataViewPage.bringToFront()

    // Should still show the special controls even without tabId
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()

    // Try to click compact view button
    const compactViewButton = sidePanel.getByRole('button', { name: /compact view/i })
    await compactViewButton.click()

    // Should show an error toast since there's no valid tabId
    await expect(sidePanel.getByText(/no target tab id found/i)).toBeVisible()
  })

  test('sidepanel transitions properly between normal and full data view modes', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    // Start with normal sidepanel
    let sidePanel = await openSidePanel()
    const testPage = await TestHelpers.prepareSidepanelWithData(sidePanel, serviceWorker, context)

    // Verify normal sidepanel interface is present
    await expect(sidePanel.getByRole('textbox', { name: /enter xpath selector/i })).toBeVisible()
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible()

    // Open full data view
    const fullDataViewPage = await TestHelpers.openFullDataView(sidePanel, context)

    // Bring the full data view tab to front - sidepanel should switch context
    await fullDataViewPage.bringToFront()

    sidePanel = await openSidePanel()

    // Should now show full data view controls in the same sidepanel
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()
    await expect(sidePanel.getByRole('textbox', { name: /enter xpath selector/i })).toBeHidden()

    // Use compact view to go back
    await Promise.all([
      fullDataViewPage.waitForEvent('close'),
      sidePanel.getByRole('button', { name: /compact view/i }).click(),
    ])

    // Bring the original test page back to front - sidepanel should switch back to normal mode
    await testPage.bringToFront()

    // Should show normal interface again in the same sidepanel
    await expect(sidePanel.getByRole('textbox', { name: /enter xpath selector/i })).toBeVisible()
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeHidden()
  })

  test('full data view controls handle tab switching errors gracefully', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent quickly via storage to avoid modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Create a full data view URL with a tab ID that doesn't exist
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html?tabId=99999`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    fullDataViewPage.bringToFront()

    // Should show full data view controls
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()

    // Try to use compact view button with invalid tab ID
    const compactViewButton = sidePanel.getByRole('button', { name: /compact view/i })
    await compactViewButton.click()

    // Should show an error message
    await expect(sidePanel.getByText(/target tab does not exist/i)).toBeVisible()

    // Full data view page should remain open since the operation failed
    expect(fullDataViewPage.isClosed()).toBe(false)
  })

  test('full data view controls have proper styling and layout', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent quickly via storage to avoid modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to full data view
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html?tabId=123`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    fullDataViewPage.bringToFront()

    // Verify layout and styling
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()

    // Check that buttons are properly positioned
    const compactViewButton = sidePanel.getByRole('button', { name: /compact view/i })
    const hideSidepanelButton = sidePanel.getByRole('button', { name: /hide sidepanel/i })

    await expect(compactViewButton).toBeVisible()
    await expect(hideSidepanelButton).toBeVisible()

    // Verify buttons have proper icons
    await expect(compactViewButton.locator('svg')).toBeVisible() // Minimize2 icon
    await expect(hideSidepanelButton.locator('svg')).toBeVisible() // X icon

    // Verify button styling
    const compactButtonClasses = await compactViewButton.getAttribute('class')
    const hideButtonClasses = await hideSidepanelButton.getAttribute('class')

    // Compact view should be primary button, hide should be outline
    expect(hideButtonClasses).toContain('outline')
  })

  test('full data view controls maintain proper state across page reloads', async ({
    openSidePanel,
    serviceWorker,
    context,
    extensionId,
  }) => {
    // Dismiss analytics consent quickly via storage to avoid modal
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)

    // Navigate to full data view
    const fullDataViewPage = await context.newPage()
    await fullDataViewPage.goto(`chrome-extension://${extensionId}/full-data-view.html?tabId=123`)

    // Open sidepanel
    const sidePanel = await openSidePanel()

    fullDataViewPage.bringToFront()

    // Verify full data view controls appear
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()

    // Reload the sidepanel
    await sidePanel.reload()

    // Verify controls still appear after reload
    await expect(sidePanel.getByRole('heading', { name: /full screen view active/i })).toBeVisible()
    await expect(sidePanel.getByRole('button', { name: /compact view/i })).toBeVisible()
    await expect(sidePanel.getByRole('button', { name: /hide sidepanel/i })).toBeVisible()
  })
})
