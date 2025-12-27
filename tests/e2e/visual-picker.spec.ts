import { expect, test, TestHelpers } from './fixtures'

test.describe('Visual Element Picker', () => {
  test.describe('Enabling Picker Mode', () => {
    test('enables via crosshair button in sidepanel', async ({
      openSidePanel,
      context,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const sidePanel = await openSidePanel()

      const testPage = await context.newPage()
      await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
      await testPage.bringToFront()

      // Bring sidepanel to front and click crosshair button
      const crosshairButton = sidePanel.getByLabel(/open visual picker/i)
      await crosshairButton.click()

      // Switch back to test page
      await testPage.bringToFront()

      // Verify picker is active
      const pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })

      expect(pickerActive).toBe(true)
    })

    test('toggles picker mode on and off', async ({ openSidePanel, context, serviceWorker }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const sidePanel = await openSidePanel()

      const testPage = await context.newPage()
      await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
      await testPage.bringToFront()

      // Enable picker via crosshair button
      let crosshairButton = sidePanel.getByLabel(/open visual picker/i)
      await crosshairButton.click()

      // Verify picker is active
      let pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })
      expect(pickerActive).toBe(true)

      // Toggle off
      crosshairButton = sidePanel.getByLabel(/close visual picker/i)
      await crosshairButton.click()

      // Verify picker is no longer active
      pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })
      expect(pickerActive).toBe(false)
    })
  })

  test.describe('Element Selection', () => {
    test('escape key exits picker mode without scraping', async ({
      openSidePanel,
      context,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const sidePanel = await openSidePanel()

      const testPage = await context.newPage()
      await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
      await testPage.bringToFront()

      // Enable picker via crosshair button
      const crosshairButton = sidePanel.getByLabel(/open visual picker/i)
      await crosshairButton.click()

      // Verify picker is active
      let pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })
      expect(pickerActive).toBe(true)

      // Press Escape
      await testPage.keyboard.press('Escape')

      // Verify picker is no longer active
      pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })
      expect(pickerActive).toBe(false)

      // Verify no scrape occurred (sidepanel should not have data table)
      const dataTable = sidePanel.getByRole('heading', { name: /extracted data/i })
      await expect(dataTable).toBeHidden()
    })

    test('clicking on element finalizes selection and triggers scrape', async ({
      openSidePanel,
      context,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const sidePanel = await openSidePanel()

      const testPage = await context.newPage()
      await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
      await testPage.bringToFront()

      // Enable picker via crosshair button
      const crosshairButton = sidePanel.getByLabel(/open visual picker/i)
      await crosshairButton.click()

      // Move mouse to an element (e.g., first heading) and click
      // Use evaluate to click directly to avoid picker interception issues
      await testPage.evaluate(() => {
        const h1 = document.querySelector('h1')
        if (h1) {
          // Trigger click event
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
          })
          h1.dispatchEvent(clickEvent)
        }
      })

      // Verify picker is no longer active
      const pickerActive = await testPage.evaluate(() => {
        return document.documentElement.classList.contains('scrape-similar-picker-active')
      })
      expect(pickerActive).toBe(false)

      // Verify scrape occurred (sidepanel should have data table)
      const dataTable = sidePanel.getByRole('heading', { name: /extracted data/i })
      await expect(dataTable).toBeVisible()
    })
  })
})
