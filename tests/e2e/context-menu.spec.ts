import type { Page } from '@playwright/test'
import {
  expect,
  TABLE_LAYOUTS_PAGE,
  TABLE_LAYOUTS_PAGE_COUNTS,
  test,
  TestHelpers,
} from './fixtures'

/** For each element `selector` matches: its tag and the id of the table it is in. */
const describeMatches = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const result = document.evaluate(
      selector,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    )
    return Array.from({ length: result.snapshotLength }, (_, i) => {
      const element = result.snapshotItem(i) as Element
      return `${element.tagName.toLowerCase()} in #${element.closest('table')?.id ?? ''}`
    })
  }, selector)

const TABLE_ROW_CASES = [
  {
    cell: '#header-in-tbody-cell',
    table: 'header-in-tbody',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.headerInTbody,
  },
  {
    cell: '#thead-filter-row-cell',
    table: 'thead-filter-row',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.theadFilterRow,
  },
  {
    cell: '#layout-outer-cell',
    table: 'layout-outer',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.layoutOuter,
  },
  {
    cell: '#layout-inner-cell',
    table: 'layout-inner',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.layoutInner,
  },
  {
    cell: '#sibling-first-cell',
    table: 'sibling-first',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.siblingTable,
  },
  {
    cell: '#sibling-second-cell',
    table: 'sibling-second',
    rows: TABLE_LAYOUTS_PAGE_COUNTS.siblingTable,
  },
]

test.describe('Scrape similar from the context menu', () => {
  for (const { cell, table, rows } of TABLE_ROW_CASES) {
    test(`matches only the rows of #${table}`, async ({
      context,
      serviceWorker,
      fixturePageUrl,
    }) => {
      const page = await context.newPage()
      await page.goto(fixturePageUrl(TABLE_LAYOUTS_PAGE))

      const { mainSelector } = await TestHelpers.guessConfigFromContextMenu(
        serviceWorker,
        page,
        page.locator(cell),
      )

      expect(await describeMatches(page, mainSelector)).toEqual(
        Array.from({ length: rows }, () => `tr in #${table}`),
      )
    })
  }
})
