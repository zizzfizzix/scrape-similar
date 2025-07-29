import { expect, test, waitForChromeApi } from './fixtures'

test.describe('Sidepanel', () => {
  test('sidepanel shows unsupported URL splash when opened on a non-supported URL', async ({
    context,
    extensionId,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    await expect(sidePanel).toBeTruthy()

    const testPage = await context.newPage()
    await testPage.goto(`chrome-extension://${extensionId}/options.html`)

    // Dismiss consent modal if present
    const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
    if (await acceptButton.isVisible()) {
      await acceptButton.click()
      await expect(acceptButton).toBeHidden()
    }

    await expect(sidePanel.getByText(/unsupported url/i)).toBeVisible()
  })

  test("sidepanel doesn't show unsupported URL splash when opened on a supported URL", async ({
    context,
    extensionId,
    openSidePanel,
  }) => {
    const sidePanel = await openSidePanel()

    await expect(sidePanel).toBeTruthy()

    const testPage = await context.newPage()
    await testPage.goto('https://one.one.one.one/')

    // Dismiss consent modal if present
    const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
    if (await acceptButton.isVisible()) {
      await acceptButton.click()
      await expect(acceptButton).toBeHidden()
    }

    await expect(sidePanel.getByText(/unsupported url/i)).toBeHidden()
  })

  test('prompts for analytics consent and persists accept decision', async ({
    context,
    extensionId,
    openSidePanel,
  }) => {
    // Ensure we have a reference to the extension's service-worker for storage checks.
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes(extensionId),
      })
    }

    // Open the side-panel on a blank page.
    const sidePanel = await openSidePanel()

    // The consent modal should appear on first visit.
    const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
    await expect(acceptButton).toBeVisible()

    // Accept analytics collection.
    await acceptButton.click()
    await expect(acceptButton).toBeHidden()

    // Verify chrome.storage.sync.analytics_consent is true.
    await waitForChromeApi(serviceWorker)
    const consent = await serviceWorker.evaluate(async () => {
      const { analytics_consent } = await chrome.storage.sync.get('analytics_consent')
      return analytics_consent
    })

    expect(consent).toBe(true)
  })

  test('allows unlocking and toggling debug mode which persists across reloads', async ({
    context,
    extensionId,
    openSidePanel,
  }) => {
    // Grab (or wait for) the service-worker to assert storage changes.
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes(extensionId),
      })
    }

    // Launch the side-panel.
    const sidePanel = await openSidePanel()

    // Dismiss consent modal if present.
    const acceptButton = sidePanel.getByRole('button', { name: /accept/i })
    if (await acceptButton.isVisible()) {
      await acceptButton.click()
      await expect(acceptButton).toBeHidden()
    }

    // Open the settings drawer via the toolbar button.
    await sidePanel.getByRole('button', { name: /settings/i }).click()

    // Unlock hidden debug switch by clicking the drawer heading 5×.
    const heading = sidePanel.getByRole('heading', { name: /settings/i })
    for (let i = 0; i < 5; i++) {
      await heading.click()
    }

    const debugSwitch = sidePanel.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitch).toBeVisible()
    await expect(debugSwitch).toHaveAttribute('data-state', 'unchecked')

    // Enable debug mode.
    await debugSwitch.click()
    await expect(debugSwitch).toHaveAttribute('data-state', 'checked')

    // Confirm storage mutation (chrome.storage.local.debugMode === true).
    await waitForChromeApi(serviceWorker)
    const debugMode = await serviceWorker.evaluate(async () => {
      const { debugMode } = await chrome.storage.local.get('debugMode')
      return debugMode
    })
    expect(debugMode).toBe(true)

    // Reload the side-panel and reopen the settings drawer — the switch should remain enabled.
    await sidePanel.reload()
    await sidePanel.getByRole('button', { name: /settings/i }).click()
    const debugSwitchAfterReload = sidePanel.getByRole('switch', { name: /debug mode/i })
    await expect(debugSwitchAfterReload).toHaveAttribute('data-state', 'checked')
  })
})
