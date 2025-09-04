import pkg from '@@/package.json' with { type: 'json' }
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import fs from 'fs'
import { v7 as uuidv7 } from 'uuid'
const { chromeExtensionId } = pkg

async function waitForChromeApis(worker: Worker, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const hasApi = await worker.evaluate(
      () =>
        typeof chrome !== 'undefined' &&
        typeof chrome?.storage !== 'undefined' &&
        typeof chrome?.tabs !== 'undefined' &&
        typeof chrome?.sidePanel !== 'undefined' &&
        typeof chrome?.runtime !== 'undefined',
    )
    if (hasApi) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('chrome.* APIs never became available')
}

// Shared test helpers
export const TestHelpers = {
  /**
   * Dismisses analytics consent modal by setting storage directly
   */
  async dismissAnalyticsConsent(serviceWorker: Worker): Promise<void> {
    await serviceWorker.evaluate(() => {
      chrome.storage.sync.set({ analytics_consent: false })
    })
  },

  /**
   * Opens the options page for the extension
   */
  async openOptionsPage(context: BrowserContext, extensionId: string): Promise<Page> {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    return page
  },

  /**
   * Opens the onboarding page for the extension
   */
  async openOnboardingPage(context: BrowserContext, extensionId: string): Promise<Page> {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/onboarding.html`)
    return page
  },

  /**
   * Opens the full data view page for the extension
   */
  async openFullDataViewPage(context: BrowserContext, extensionId: string): Promise<Page> {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/full-data-view.html`)
    return page
  },

  /**
   * Unlocks debug mode by clicking the settings heading 5 times
   */
  async unlockDebugMode(page: Page): Promise<void> {
    const heading = page.getByRole('heading', { name: /settings/i })
    for (let i = 0; i < 5; i++) {
      await heading.click()
    }
  },

  /**
   * Stubs the clipboard API to capture copied text
   */
  async stubClipboard(page: Page): Promise<void> {
    await page.evaluate(() => {
      ;(window as any).__copied = null
      navigator.clipboard.writeText = async (t) => {
        ;(window as any).__copied = t
        return Promise.resolve()
      }
    })
  },

  /**
   * Gets the text that was copied to the stubbed clipboard
   */
  async getCopiedText(page: Page): Promise<string | null> {
    return await page.evaluate(() => (window as any).__copied)
  },

  /**
   * Prepares sidepanel with scraped data from a test page
   */
  async prepareSidepanelWithData(
    sidePanel: Page,
    serviceWorker: Worker,
    context: BrowserContext,
    options: {
      testPageUrl?: string
      selector?: string
      dismissConsent?: boolean
    } = {},
  ): Promise<Page> {
    const {
      testPageUrl = 'https://en.wikipedia.org/wiki/Playwright_(software)',
      selector = '//h2',
      dismissConsent = true,
    } = options

    // Dismiss analytics consent if requested
    if (dismissConsent) {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    }

    // Navigate to test page
    const testPage = await context.newPage()
    await testPage.goto(testPageUrl)
    await testPage.bringToFront()

    // Configure selector and scrape data
    const mainSelector = sidePanel.locator('#mainSelector')
    await mainSelector.fill(selector)
    await mainSelector.press('Enter')

    // Auto-generate configuration
    await sidePanel
      .getByRole('button', { name: /auto-generate configuration from selector/i })
      .click()

    // Wait for selector validation
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await base.expect(countBadge).toBeVisible({ timeout: 5000 })

    // Perform scrape
    await sidePanel.getByRole('button', { name: /^scrape$/i }).click()

    // Wait for data table to appear
    await base.expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeVisible({
      timeout: 10000,
    })

    return testPage
  },

  /**
   * Opens full data view from sidepanel expand button
   */
  async openFullDataView(sidePanel: Page, context: BrowserContext): Promise<Page> {
    const [fullDataViewPage] = await Promise.all([
      context
        .waitForEvent('page', { predicate: (p) => p.url().includes('full-data-view.html') })
        .then(async (p) => {
          await p.locator('table').waitFor({ state: 'visible' })
          return p
        }),
      sidePanel.getByRole('button', { name: /open in full view/i }).click(),
    ])

    return fullDataViewPage
  },

  /**
   * Verifies analytics consent storage value
   */
  async verifyAnalyticsConsent(serviceWorker: Worker, expectedValue: boolean): Promise<void> {
    const consent = await serviceWorker.evaluate(async () => {
      const { analytics_consent } = await chrome.storage.sync.get('analytics_consent')
      return analytics_consent
    })
    base.expect(consent).toBe(expectedValue)
  },

  /**
   * Verifies debug mode storage value
   */
  async verifyDebugMode(serviceWorker: Worker, expectedValue: boolean): Promise<void> {
    const debugMode = await serviceWorker.evaluate(async () => {
      const { debugMode } = await chrome.storage.local.get('debugMode')
      return debugMode
    })
    base.expect(debugMode).toBe(expectedValue)
  },
}

export const test = base.extend<{
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  openSidePanel: (transitionUrl?: string) => Promise<Page>
}>({
  // Launch a persistent context with the built extension loaded.
  context: async ({}, use) => {
    const buildTypeSuffix = (env = 'production') => {
      if (env === 'test') return '-test'
      if (env === 'development') return '-dev'
      return ''
    }

    const extensionPath = `${process.cwd()}/.output/chrome-mv3${buildTypeSuffix(process.env.NODE_ENV)}`
    // Use different user data dir for each test run to parallelize tests.
    const userDataDir = `${process.cwd()}/.browser/${uuidv7()}`

    // Allow Playwright to attach to Chrome side-panel targets (workaround for
    // https://github.com/microsoft/playwright/issues/26693).
    process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1'

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: !!process.env.CI,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })

    await use(context)
    await context.close()
    // Cleanup user data dir after each test run.
    fs.rmSync(userDataDir, { recursive: true })
  },

  // Expose the extension ID so that tests can open extension pages
  extensionId: async ({}, use) => {
    if (!chromeExtensionId) {
      throw new Error('chromeExtensionId is not set')
    }
    await use(chromeExtensionId)
  },

  serviceWorker: async ({ context, extensionId }, use) => {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes(extensionId),
      })
    }

    await waitForChromeApis(serviceWorker)

    await use(serviceWorker)
  },

  openSidePanel: async ({ context, extensionId, serviceWorker }, use, testInfo) => {
    const open = async (transitionUrl: string = 'https://one.one.one.one/') => {
      // Navigate to any page (default is a simple Cloudflare IP resolver page).
      const page = await context.newPage()
      await page.goto(transitionUrl)

      // Register a one-off listener that will open the side-panel once triggered.
      await serviceWorker.evaluate(() => {
        const handler = (msg: string, sender: chrome.runtime.MessageSender) => {
          if (msg === 'openSidePanelFromTest') {
            if (sender.tab?.id !== undefined && sender.tab.windowId !== undefined) {
              chrome.sidePanel.open({ tabId: sender.tab.id, windowId: sender.tab.windowId })
            }
            chrome.runtime.onMessage.removeListener(handler)
          }
        }
        chrome.runtime.onMessage.addListener(handler)
      })

      // Inject a button into the page that, when clicked, sends the trigger message.
      await serviceWorker.evaluate(async (tabUrl) => {
        const [transitionTab] = await chrome.tabs.query({ url: tabUrl })
        if (!transitionTab?.id) throw new Error('No active tab found')

        await chrome.scripting.executeScript({
          target: { tabId: transitionTab.id },
          func: () => {
            if (document.getElementById('openSidePanelBtn')) return

            const btn = document.createElement('button')
            btn.id = 'openSidePanelBtn'
            btn.textContent = 'Open Side Panel'
            btn.style.position = 'fixed'
            btn.style.bottom = '10px'
            btn.style.right = '10px'
            btn.style.zIndex = '2147483647'
            btn.addEventListener('click', () => {
              chrome.runtime.sendMessage('openSidePanelFromTest')
            })

            document.body.appendChild(btn)
          },
        })
      }, page.url())

      // Get a handle for the sidepanel when it appears.
      const sidePanelPage = context.waitForEvent('page', {
        predicate: (p) => p.url().startsWith(`chrome-extension://${extensionId}/sidepanel.html`),
      })

      // Click the injected button to trigger the sidepanel opening.
      await page.click('#openSidePanelBtn')

      // Close the transition page.
      await page.close()

      // Wait for the sidepanel to appear and return it.
      return await sidePanelPage.then((p) => {
        // Due to PW_CHROMIUM_ATTACH_TO_OTHER=1 sidepanel inherits the viewport of other pages,
        // the viewport size is reset to the default 360px wide and the height from the config..
        p.setViewportSize({ width: 360, height: testInfo.project.use.viewport?.height ?? 720 })
        return p
      })
    }

    await use(open)
  },
})

export const expect = test.expect
