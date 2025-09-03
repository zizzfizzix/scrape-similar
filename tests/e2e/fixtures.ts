import pkg from '@@/package.json' assert { type: 'json' }
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import fs from 'fs'

async function waitForChromeApi(worker: Worker, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const hasApi = await worker.evaluate(() => typeof chrome !== 'undefined')
    if (hasApi) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('chrome.* APIs never became available')
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

    const userDataDir = `${process.cwd()}/.browser`
    // Reset browser user data before each test
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true })
    }

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
  },

  // Expose the extension ID so that tests can open extension pages
  extensionId: async ({}, use) => {
    const extensionId = pkg.chromeExtensionId
    if (!extensionId) {
      throw new Error('chromeExtensionId is not set')
    }
    await use(extensionId)
  },

  serviceWorker: async ({ context, extensionId }, use) => {
    let [serviceWorker] = context.serviceWorkers()
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', {
        predicate: (w) => w.url().includes(extensionId),
      })
    }

    await waitForChromeApi(serviceWorker)

    await use(serviceWorker)
  },

  openSidePanel: async ({ context, extensionId, serviceWorker }, use, testInfo) => {
    const open = async (transitionUrl: string = 'https://one.one.one.one/') => {
      // Navigate to any page (default is a simple Cloudflare IP resolver page).
      const page = await context.newPage()
      await page.goto(transitionUrl)

      // Bring the tab to the foreground so the service-worker can inject scripts.
      await page.bringToFront()

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
      await serviceWorker.evaluate(async () => {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!activeTab?.id) throw new Error('No active tab found')

        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
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
      })

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
