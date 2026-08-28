import { MESSAGE_TYPES } from '@/utils/types'
import pkg from '@@/package.json' with { type: 'json' }
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import type ExcelJS from 'exceljs'
import fs from 'fs'
import http from 'http'
import type { AddressInfo } from 'net'
import path from 'path'
import { v7 as uuidv7 } from 'uuid'
const { chromeExtensionId } = pkg

/** Fixture page served as the default scrape target. */
export const SCRAPE_TARGET_PAGE = 'scrape-target.html'

/**
 * Second scrape target, for specs that need two tabs holding distinct data.
 * Its title shares no words with SCRAPE_TARGET_PAGE's.
 */
export const ALT_SCRAPE_TARGET_PAGE = 'scrape-target-alt.html'

/**
 * Transition page openSidePanel() uses to trigger the side panel. Deliberately
 * distinct from every scrape target: the tab is looked up by URL through
 * chrome.tabs.query, which would be ambiguous if a spec had opened a page at
 * the same URL.
 */
export const BLANK_PAGE = 'blank.html'

/**
 * The page the onboarding demo navigates to at the end of the flow. It is baked
 * into the extension (`OnboardingApp.tsx`, `isTest` branch), so the specs cannot
 * point it at the fixture server's per-worker ephemeral port - they serve
 * DEMO_TARGET_PAGE at this URL instead, see TestHelpers.mockDemoTargetPage.
 */
export const DEMO_TARGET_URL =
  'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population'

/** Local stand-in for the live article at DEMO_TARGET_URL. */
export const DEMO_TARGET_PAGE = 'wikitable-demo.html'

/**
 * Facts about tests/e2e/fixtures/pages/wikitable-demo.html the onboarding demo
 * assertions rely on. Keep in sync when editing that file.
 */
export const DEMO_TARGET_PAGE_FACTS = {
  /** Data rows in the `wikitable`, excluding its header row. */
  tableRows: 12,
  /** Rows the baked demo config selects: `position() > 1 and position() <= 11`. */
  scrapedRows: 10,
  /** Cells of the first scraped row, in the demo config's column order. */
  firstRow: ['1', 'India', '1,450,935,791', '17.8%', '1 Jul 2024'],
  /** Country link text of the last scraped row - row 11 must stay out of range. */
  lastScrapedCountry: 'Ethiopia',
} as const

/**
 * Match counts of tests/e2e/fixtures/pages/scrape-target.html.
 * Keep in sync when editing that file.
 */
export const FIXTURE_PAGE_COUNTS = {
  /** `//a` */
  a: 13,
  /** `//span` */
  span: 24,
  /** `//li` */
  li: 12,
  /** `//p` */
  p: 4,
  /** `//h1` */
  h1: 1,
  /** `//h2` */
  h2: 2,
  /** `//h3` */
  h3: 2,
  /** `//ul` */
  ul: 1,
  /** `//article` */
  article: 1,
  /** `//tbody/tr` */
  tbodyTr: 3,
  /** `//h2 | //h3` */
  h2h3: 4,
  /** `//h1 | //h2 | //h3 | //h4 | //h5 | //h6` (the Headings system preset) */
  headings: 5,
  /** `//a[starts-with(@href, "/") or ...]` (the Internal links system preset) */
  internalLinks: 12,
  /** `//div[@class] | //h2` - the div holds no text, so it scrapes to an empty row */
  divWithClassOrH2: 3,
  /** ...of which this many scrape to a non-empty row */
  divWithClassOrH2NonEmpty: 2,
} as const

/** Default scrape target selector of TestHelpers.prepareSidepanelWithData. */
export const DEFAULT_SCRAPE_SELECTOR = '(//a)[position() <= 10]'

/** Rows DEFAULT_SCRAPE_SELECTOR yields on either scrape target. */
export const DEFAULT_SCRAPE_ROW_COUNT = 10

/** XPath that is guaranteed not to match anything on the fixture pages. */
export const NO_MATCH_SELECTOR = '//*[@id="nonexistent_element_for_test"]'

const FIXTURE_PAGES_ROOT = path.join(import.meta.dirname, 'fixtures', 'pages')

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'

const CONTENT_TYPES: Record<string, string> = {
  '.html': HTML_CONTENT_TYPE,
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

/**
 * Serves tests/e2e/fixtures/pages over HTTP on an ephemeral port.
 * Content scripts only run on http(s) URLs, so fixture pages cannot be loaded
 * from disk - and serving them locally keeps the scrape targets deterministic
 * and the suite independent of any external site.
 *
 * The fixture files are enumerated once up front and the request path is only
 * ever used as a lookup key, never to build a filesystem path. That keeps the
 * server incapable of reading anything outside the fixture directory (files are
 * top-level only; nested directories are not served).
 */
const startFixturePagesServer = async () => {
  const servableFiles = new Map<string, string>(
    fs
      .readdirSync(FIXTURE_PAGES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [`/${entry.name}`, path.join(FIXTURE_PAGES_ROOT, entry.name)]),
  )

  const server = http.createServer((req, res) => {
    const [rawPath = '/'] = (req.url ?? '/').split('?')
    const requestPath = decodeURIComponent(rawPath)
    const filePath = servableFiles.get(requestPath)
    if (!filePath) {
      res.writeHead(404).end(`No such fixture: ${requestPath}`)
      return
    }

    fs.readFile(filePath, (error, contents) => {
      if (error) {
        res.writeHead(500).end('Failed to read fixture')
        return
      }
      res.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      })
      res.end(contents)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

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

/**
 * Returns the first worksheet of a workbook read back from an export, failing
 * the test if the workbook turned out to be empty.
 */
export const getFirstWorksheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet => {
  const [worksheet] = workbook.worksheets
  if (!worksheet) {
    throw new Error('Exported workbook has no worksheets')
  }
  return worksheet
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
   * Serves DEMO_TARGET_PAGE in place of the live article the onboarding demo
   * navigates to.
   *
   * Routed on the context rather than a page: the onboarding tab navigates
   * itself to the demo URL, and the extension keys the demo scrape off that
   * URL, so the fixture has to answer for the real address.
   */
  async mockDemoTargetPage(context: BrowserContext): Promise<void> {
    await context.route(DEMO_TARGET_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: HTML_CONTENT_TYPE,
        body: fs.readFileSync(path.join(FIXTURE_PAGES_ROOT, DEMO_TARGET_PAGE), 'utf8'),
      }),
    )
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
      /** Fixture page to scrape - resolve it with the `fixturePageUrl` fixture. */
      testPageUrl: string
      /** Override together with `expectedMatchCount`, so the two stay consistent. */
      selector?: string
      expectedMatchCount?: number
      dismissConsent?: boolean
    },
  ): Promise<Page> {
    const {
      testPageUrl,
      selector = DEFAULT_SCRAPE_SELECTOR,
      expectedMatchCount = DEFAULT_SCRAPE_ROW_COUNT,
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

    // Wait for selector validation. The fixture pages are static, so the badge
    // must report the exact match count rather than any number.
    const countBadge = sidePanel
      .locator('[data-slot="badge"]')
      .filter({ hasText: new RegExp(`^${expectedMatchCount}$`) })
    await base.expect(countBadge).toBeVisible()

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

  /**
   * Sets user presets in sync storage (for E2E import/export tests).
   * Uses the same shape WXT defineItem uses: value at user_presets, version at user_presets$
   */
  async setUserPresets(
    serviceWorker: Worker,
    presets: Array<Record<string, unknown>>,
  ): Promise<void> {
    await serviceWorker.evaluate((presets) => {
      chrome.storage.sync.set({
        user_presets: presets,
        user_presets$: { v: 1 },
      })
    }, presets)
  },

  /**
   * Reads user presets from sync storage (for E2E assertions).
   */
  async getUserPresets(serviceWorker: Worker): Promise<Array<Record<string, unknown>>> {
    return await serviceWorker.evaluate(async () => {
      const { user_presets } = await chrome.storage.sync.get('user_presets')
      return Array.isArray(user_presets) ? user_presets : []
    })
  },
}

export const test = base.extend<
  {
    context: BrowserContext
    extensionId: string
    serviceWorker: Worker
    openSidePanel: (transitionUrl?: string) => Promise<Page>
    fixturePageUrl: (name: string) => string
  },
  { fixturePagesBaseUrl: string }
>({
  // Worker-scoped static server for the local HTML fixtures.
  fixturePagesBaseUrl: [
    async ({}, use) => {
      const server = await startFixturePagesServer()
      await use(server.baseUrl)
      await server.close()
    },
    { scope: 'worker' },
  ],

  // Resolves a fixture file name to its served URL, e.g.
  // fixturePageUrl('scrape-target.html').
  fixturePageUrl: async ({ fixturePagesBaseUrl }, use) => {
    await use((name: string) => new URL(name, fixturePagesBaseUrl).href)
  },

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

  openSidePanel: async ({ context, extensionId, serviceWorker, fixturePageUrl }, use, testInfo) => {
    const open = async (transitionUrl: string = fixturePageUrl(BLANK_PAGE)) => {
      // Navigate to any injectable page (default is the blank local fixture).
      const page = await context.newPage()
      await page.goto(transitionUrl)

      // Inject a button into the page that, when clicked, sends the trigger message.
      await serviceWorker.evaluate(
        async (arg) => {
          const { tabUrl, MESSAGE_TYPES } = arg
          const [transitionTab] = await chrome.tabs.query({ url: tabUrl })
          if (!transitionTab?.id) throw new Error('No active tab found')

          await chrome.scripting.executeScript({
            target: { tabId: transitionTab.id },
            func: (MESSAGE_TYPES) => {
              if (document.getElementById('openSidePanelBtn')) return

              const btn = document.createElement('button')
              btn.id = 'openSidePanelBtn'
              btn.textContent = 'Open Side Panel'
              btn.style.position = 'fixed'
              btn.style.bottom = '10px'
              btn.style.right = '10px'
              btn.style.zIndex = '2147483647'
              btn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_SIDEPANEL })
              })

              document.body.appendChild(btn)
            },
            args: [MESSAGE_TYPES],
          })
        },
        { tabUrl: page.url(), MESSAGE_TYPES },
      )

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
