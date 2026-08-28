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

/**
 * How long a single openSidePanel() attempt waits for the side-panel target to
 * attach. Kept well under the test timeout so a lost target leaves room for a
 * retry rather than burning the whole budget.
 */
const SIDE_PANEL_ATTACH_TIMEOUT = 7_000

/** How many times openSidePanel() retries a side-panel target that never attached. */
const SIDE_PANEL_OPEN_ATTEMPTS = 2

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
 * How long a fresh context is given to expose the extension's service-worker
 * target before it is written off as unusable.
 */
const EXTENSION_WORKER_TIMEOUT = 10_000

/** How many times the context fixture relaunches a browser with no visible worker. */
const CONTEXT_LAUNCH_ATTEMPTS = 3

const findExtensionWorker = (context: BrowserContext, extensionId: string) =>
  context.serviceWorkers().find((worker) => worker.url().includes(extensionId))

/** Reports whether Playwright can see the extension's service worker at all. */
const hasVisibleExtensionWorker = async (context: BrowserContext, extensionId: string) => {
  if (findExtensionWorker(context, extensionId)) return true

  const started = context.waitForEvent('serviceworker', {
    predicate: (worker) => worker.url().includes(extensionId),
    timeout: EXTENSION_WORKER_TIMEOUT,
  })
  // Nothing awaits this promise when the wait times out; keep its rejection
  // handled so it cannot surface as an unhandled rejection.
  started.catch(() => {})

  try {
    await started
    return true
  } catch {
    return false
  }
}

/**
 * Recovers a service worker Playwright never attached to.
 *
 * Chrome can create the extension's worker before Playwright attaches to that
 * target, and Playwright then never exposes it for the rest of the session
 * however alive the worker is - it keeps running and answering messages while
 * `context.serviceWorkers()` stays empty, so every helper that drives the worker
 * handle hangs until the test times out. It shows up under CPU load, which is
 * why it reads as flakiness. See microsoft/playwright#39075.
 *
 * `chrome.runtime.reload()` does not help: it produces no new target either.
 * Stopping the worker through CDP does, because the restart happens while
 * Playwright is definitely attached.
 */
const restartExtensionWorker = async (context: BrowserContext, extensionId: string) => {
  const page = await context.newPage()
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('ServiceWorker.enable')
    await cdp.send('ServiceWorker.stopAllWorkers')
    await cdp.detach()

    // Loading an extension page and messaging the runtime starts it back up.
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await page.evaluate(
      (type) => chrome.runtime.sendMessage({ type }),
      MESSAGE_TYPES.GET_DEBUG_MODE,
    )
  } catch {
    // Recovery is best effort - the caller relaunches the browser if it failed.
  } finally {
    await page.close().catch(() => {})
  }
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
  context: async ({ extensionId }, use) => {
    const buildTypeSuffix = (env = 'production') => {
      if (env === 'test') return '-test'
      if (env === 'development') return '-dev'
      return ''
    }

    const extensionPath = `${process.cwd()}/.output/chrome-mv3${buildTypeSuffix(process.env.NODE_ENV)}`

    // Allow Playwright to attach to Chrome side-panel targets (workaround for
    // https://github.com/microsoft/playwright/issues/26693).
    process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1'

    // Use different user data dir for each launch to parallelize tests.
    const userDataDirs: string[] = []
    const launch = async () => {
      const userDataDir = `${process.cwd()}/.browser/${uuidv7()}`
      userDataDirs.push(userDataDir)
      return await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: !!process.env.CI,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      })
    }

    // Recover from, and as a last resort discard, a context whose extension
    // service worker Playwright failed to attach to - see restartExtensionWorker.
    let context: BrowserContext | undefined
    try {
      for (let attempt = 1; attempt <= CONTEXT_LAUNCH_ATTEMPTS && !context; attempt++) {
        const candidate = await launch()

        let isWorkerVisible = await hasVisibleExtensionWorker(candidate, extensionId)
        if (!isWorkerVisible) {
          await restartExtensionWorker(candidate, extensionId)
          isWorkerVisible = await hasVisibleExtensionWorker(candidate, extensionId)
        }

        if (isWorkerVisible) {
          context = candidate
        } else {
          // Even a restarted worker stayed invisible; the context is unusable.
          await candidate.close()
        }
      }

      if (!context) {
        throw new Error(
          `Extension service worker never became visible after ${CONTEXT_LAUNCH_ATTEMPTS} browser launches`,
        )
      }

      await use(context)
    } finally {
      await context?.close()
      // Cleanup user data dirs after each test run.
      for (const userDataDir of userDataDirs) {
        fs.rmSync(userDataDir, { recursive: true, force: true })
      }
    }
  },

  // Expose the extension ID so that tests can open extension pages
  extensionId: async ({}, use) => {
    if (!chromeExtensionId) {
      throw new Error('chromeExtensionId is not set')
    }
    await use(chromeExtensionId)
  },

  serviceWorker: async ({ context, extensionId }, use) => {
    // The context fixture only hands over a browser whose worker it can see.
    const serviceWorker = findExtensionWorker(context, extensionId)
    if (!serviceWorker) {
      throw new Error('Extension service worker stopped before the test could use it')
    }

    await waitForChromeApis(serviceWorker)

    await use(serviceWorker)
  },

  openSidePanel: async ({ context, extensionId, serviceWorker, fixturePageUrl }, use, testInfo) => {
    const sidePanelUrlPrefix = `chrome-extension://${extensionId}/sidepanel.html`

    /**
     * The side panel is window-global: once open it stays open across tab
     * switches, so a later call can hand back the page that is already attached
     * instead of paying for another open + attach round-trip. Re-triggering an
     * open panel would emit no `page` event at all, leaving the wait below to
     * time out.
     */
    const findOpenSidePanel = () =>
      context.pages().find((page) => !page.isClosed() && page.url().startsWith(sidePanelUrlPrefix))

    const resizeSidePanel = async (sidePanel: Page) => {
      // Due to PW_CHROMIUM_ATTACH_TO_OTHER=1 sidepanel inherits the viewport of other pages,
      // the viewport size is reset to the default 360px wide and the height from the config.
      await sidePanel.setViewportSize({
        width: 360,
        height: testInfo.project.use.viewport?.height ?? 720,
      })
      return sidePanel
    }

    // Inject a button into the transition page that, when clicked, sends the trigger message.
    const injectTriggerButton = async (tabUrl: string) => {
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
        { tabUrl, MESSAGE_TYPES },
      )
    }

    const triggerSidePanel = async (transitionUrl: string) => {
      // Navigate to any injectable page (default is the blank local fixture).
      const page = await context.newPage()
      try {
        await page.goto(transitionUrl)
        await injectTriggerButton(page.url())

        // Subscribe before clicking, so the target cannot attach in between.
        const sidePanelPage = context.waitForEvent('page', {
          predicate: (p) => p.url().startsWith(sidePanelUrlPrefix),
          timeout: SIDE_PANEL_ATTACH_TIMEOUT,
        })
        // A failed attempt leaves nothing awaiting this promise; keep its
        // rejection handled so it cannot surface as an unhandled rejection.
        sidePanelPage.catch(() => {})

        // Click the injected button to trigger the sidepanel opening.
        await page.click('#openSidePanelBtn')

        // Wait for the sidepanel to appear *before* closing the transition page:
        // the background opens the panel for `sender.tab`, so a tab that is
        // already gone makes chrome.sidePanel.open() throw and no panel ever
        // shows up. That race is what made every side-panel spec flaky under load.
        return await sidePanelPage
      } finally {
        // Close the transition page. It may already be gone if the context is
        // tearing down, which must not mask the original failure.
        await page.close().catch(() => {})
      }
    }

    const open = async (transitionUrl: string = fixturePageUrl(BLANK_PAGE)) => {
      let lastError: unknown
      for (let attempt = 1; attempt <= SIDE_PANEL_OPEN_ATTEMPTS; attempt++) {
        try {
          // A panel that is already attached needs no second open - including
          // one that attached late, while the previous attempt was unwinding.
          const alreadyOpen = findOpenSidePanel()
          return await resizeSidePanel(alreadyOpen ?? (await triggerSidePanel(transitionUrl)))
        } catch (error) {
          lastError = error
        }
      }

      throw new Error(
        `Side panel never attached after ${SIDE_PANEL_OPEN_ATTEMPTS} attempts: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      )
    }

    await use(open)
  },
})

export const expect = test.expect
