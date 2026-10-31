import { MESSAGE_TYPES } from '@/utils/types'
import pkg from '@@/package.json' with { type: 'json' }
import type { BrowserContext, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { DEMO_TARGET_PAGE, DEMO_TARGET_PAGE_FACTS, expect, test, TestHelpers } from '../fixtures'
import {
  BROWSER_SHOT_SIZES,
  browserShot,
  FONT_FACE_CSS,
  FONT_FAMILY,
  LOGO_LIGHT,
  promo,
  SIDE_SHOT_SIZE,
  sideShot,
  storeIcon,
  WIDE_SHOT_SIZE,
  wideShot,
} from './compose'
import { drawContextMenu, readContextMenuTitles } from './context-menu'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const OUT = path.join(ROOT, 'docs/store-assets')
const ONBOARDING_CONTEXT_MENU = path.join(ROOT, 'public/img/screenshot-context-menu.png')

/**
 * Where the scrape target is served. The full data view prints the page URL, so
 * it has to be stable rather than the fixture server's per-worker port.
 */
const STORE_PAGE_URL = 'https://example.com/countries-by-population'

const ROW_SELECTOR = '//table[contains(@class, "wikitable")]//tr[position() > 1]'

// The fixture is bare HTML, and its intro paragraph is written for the test
// suite rather than a store visitor.
const STORE_PAGE_CSS = `
  ${FONT_FACE_CSS}
  body { margin: 0; padding: 36px 48px; background: #fff; color: #1f2328;
         font: 15px/1.5 ${FONT_FAMILY}; }
  h1 { font-size: 26px; font-weight: 600; padding-bottom: 10px; margin: 0 0 20px;
       border-bottom: 1px solid #d1d9e0; }
  body > p { display: none; }
  table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #d1d9e0; padding: 6px 14px; text-align: left; }
  th { background: #f6f8fa; font-weight: 600; }
  a { color: #0969da; text-decoration: none; }`

const serveStorePage = (context: BrowserContext) => {
  const html = fs
    .readFileSync(path.join(import.meta.dirname, '../fixtures/pages', DEMO_TARGET_PAGE), 'utf8')
    .replace('</head>', `<style>${STORE_PAGE_CSS}</style></head>`)
  return context.route(STORE_PAGE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  )
}

const settle = (page: Page) => page.evaluate(() => document.fonts.ready)

/**
 * Fails when an extension page renders in the fallback font, so a page that
 * stops loading Geist cannot slip into the store images unnoticed.
 */
const expectGeistLoaded = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (face) => face.family.includes('Geist Variable') && face.status === 'loaded',
        ),
      ),
    )
    .toBe(true)

test('store assets', async ({ browser, context, serviceWorker, openSidePanel }, testInfo) => {
  test.setTimeout(120_000)
  const raw = (name: string) => testInfo.outputPath(`${name}.png`)

  // Consent off keeps PostHog from ever starting; light theme pins the captures.
  await TestHelpers.dismissAnalyticsConsent(serviceWorker)
  const extensionName = await serviceWorker.evaluate(() => chrome.runtime.getManifest().name)
  await serviceWorker.evaluate(() => chrome.storage.local.set({ theme: 'light' }))
  await serveStorePage(context)

  const sidePanel = await openSidePanel()
  const page = await context.newPage()
  for (const target of [page, sidePanel]) {
    await target.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  }
  await page.goto(STORE_PAGE_URL)
  await page.bringToFront()

  // Visual picker hovering a country link.
  await page.setViewportSize(WIDE_SHOT_SIZE)
  await sidePanel.getByLabel(/open visual picker/i).click()
  await page.bringToFront()
  await expect(page.locator('html.scrape-similar-picker-active')).toHaveCount(1)
  await page.getByRole('link', { name: 'China' }).hover()
  // The class above is set before the banner mounts and the hover is processed;
  // the outline on the last match only exists once both have happened.
  await expect(page.getByRole('link', { name: 'Japan' })).toHaveCSS(
    'outline-color',
    'rgb(255, 107, 107)',
  )
  await settle(page)
  await page.screenshot({ path: raw('picker'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(page.locator('html.scrape-similar-picker-active')).toHaveCount(0)

  // Selector, generated columns and scraped rows.
  await page.setViewportSize(BROWSER_SHOT_SIZES.page)
  await sidePanel.setViewportSize(BROWSER_SHOT_SIZES.panel)
  const mainSelector = sidePanel.locator('#mainSelector')
  await mainSelector.fill(ROW_SELECTOR)
  await mainSelector.press('Enter')
  await sidePanel
    .getByRole('button', { name: /auto-generate configuration from selector/i })
    .click()
  await expect(
    sidePanel
      .locator('[data-slot="badge"]')
      .filter({ hasText: new RegExp(`^${DEMO_TARGET_PAGE_FACTS.tableRows}$`) }),
  ).toBeVisible()
  await sidePanel.getByRole('button', { name: /^scrape$/i }).click()
  const extractedData = sidePanel.getByRole('heading', { name: /extracted data/i })
  await expect(extractedData).toBeVisible()
  await extractedData.evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await settle(sidePanel)
  await expectGeistLoaded(sidePanel)
  // The match highlight is a 3s animation that ends with no outline at all.
  // Earlier highlights (selector validation, the scrape) are let run out, then
  // it is replayed and each row is given the outline of the animation's
  // halfway keyframe as a static style, so no running animation reaches the capture.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 })
    .toBe(0)
  await serviceWorker.evaluate(
    async ({ url, selector, type }) => {
      const [tab] = await chrome.tabs.query({ url })
      if (!tab?.id) throw new Error(`No tab open at ${url}`)
      await chrome.tabs.sendMessage(tab.id, { type, payload: { selector } })
    },
    { url: STORE_PAGE_URL, selector: ROW_SELECTOR, type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS },
  )
  const frozenCount = await page.evaluate(
    () =>
      document.getAnimations().filter((animation) => {
        const effect = animation.effect
        if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof HTMLElement)) {
          return false
        }
        const halfway = effect.getKeyframes().find((keyframe) => keyframe.computedOffset === 0.5)
        if (!halfway) return false
        effect.target.style.outline = String(halfway.outline)
        effect.target.style.outlineOffset = String(halfway.outlineOffset)
        animation.cancel()
        return true
      }).length,
  )
  expect(frozenCount).toBe(DEMO_TARGET_PAGE_FACTS.tableRows)
  await page.screenshot({ path: raw('page-scraped'), animations: 'disabled' })
  await sidePanel.screenshot({ path: raw('panel-scraped'), animations: 'disabled' })

  // Export menu.
  await sidePanel.setViewportSize(SIDE_SHOT_SIZE)
  await extractedData.evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await sidePanel.getByRole('button', { name: /^export$/i }).click()
  await expect(sidePanel.getByRole('menuitem', { name: /google sheets/i })).toBeVisible()
  await settle(sidePanel)
  await sidePanel.screenshot({ path: raw('export'), animations: 'disabled' })
  await sidePanel.keyboard.press('Escape')

  // Full data view.
  const fullView = await TestHelpers.openFullDataView(sidePanel, context)
  await fullView.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await fullView.setViewportSize(WIDE_SHOT_SIZE)
  await expect(fullView.locator('tbody tr')).toHaveCount(DEMO_TARGET_PAGE_FACTS.tableRows)
  await settle(fullView)
  await expectGeistLoaded(fullView)
  await fullView.screenshot({ path: raw('full-view'), animations: 'disabled' })

  // Chrome draws its context menu natively, so it is composed over the page.
  const titles = await readContextMenuTitles()
  const menuScene = async (
    deviceScaleFactor: number,
    size: { width: number; height: number },
    out: string,
  ) => {
    const sceneContext = await browser.newContext({
      viewport: size,
      deviceScaleFactor,
      colorScheme: 'light',
    })
    await serveStorePage(sceneContext)
    const scene = await sceneContext.newPage()
    await scene.goto(STORE_PAGE_URL)
    await drawContextMenu(scene, scene.getByRole('cell', { name: '1,419,321,278' }), {
      extensionName,
      iconSrc: LOGO_LIGHT,
      titles,
    })
    await settle(scene)
    await scene.screenshot({ path: out })
    await sceneContext.close()
  }
  await menuScene(1, WIDE_SHOT_SIZE, raw('context-menu'))
  await menuScene(2, { width: 960, height: 540 }, ONBOARDING_CONTEXT_MENU)

  fs.mkdirSync(OUT, { recursive: true })
  const composeContext = await browser.newContext({ deviceScaleFactor: 1 })
  const canvas = await composeContext.newPage()
  await browserShot(canvas, {
    name: extensionName,
    title: 'Scrape similar elements from any page',
    text: 'Point at one element and get every one like it as a table, columns included.',
    pageShot: raw('page-scraped'),
    panelShot: raw('panel-scraped'),
    out: path.join(OUT, '1-scrape.png'),
  })
  await wideShot(canvas, {
    name: extensionName,
    title: 'Right-click to start',
    text: 'Quick scrape anything you right-click, or open the visual picker from the same menu.',
    shot: raw('context-menu'),
    out: path.join(OUT, '2-context-menu.png'),
  })
  await wideShot(canvas, {
    name: extensionName,
    title: 'Point and click, no XPath required',
    text: 'The visual picker highlights every matching element as you hover, then scrapes them on click.',
    shot: raw('picker'),
    out: path.join(OUT, '3-visual-picker.png'),
  })
  await sideShot(canvas, {
    name: extensionName,
    title: 'Export wherever you work',
    text: 'Send results to Google Sheets, save them as Excel or CSV, or copy them straight to the clipboard.',
    shot: raw('export'),
    out: path.join(OUT, '4-export.png'),
  })
  await wideShot(canvas, {
    name: extensionName,
    title: 'Search, sort and select in full view',
    text: 'Open the results in a full tab to search across columns, sort, and pick the rows to export.',
    shot: raw('full-view'),
    out: path.join(OUT, '5-full-view.png'),
  })
  await promo(canvas, {
    name: extensionName,
    tagline: pkg.description,
    small: path.join(OUT, 'promo-small-440x280.png'),
    marquee: path.join(OUT, 'promo-marquee-1400x560.png'),
  })
  await storeIcon(canvas, path.join(OUT, 'store-icon-128.png'))
  await composeContext.close()
})
