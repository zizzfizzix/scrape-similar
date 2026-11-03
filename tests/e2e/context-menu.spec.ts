import {
  expect,
  TABLE_LAYOUTS_PAGE,
  TABLE_LAYOUTS_PAGE_COUNTS,
  test,
  TestHelpers,
} from './fixtures'

test.describe('Scrape similar from the context menu', () => {
  test('matches only the outer rows of a nested layout table', async ({
    context,
    serviceWorker,
    fixturePageUrl,
  }) => {
    const page = await context.newPage()
    await page.goto(fixturePageUrl(TABLE_LAYOUTS_PAGE))

    const { mainSelector } = await TestHelpers.guessConfigFromContextMenu(
      serviceWorker,
      page,
      page.locator('#layout-outer-cell'),
    )

    const matchedRowTableIds = await page.evaluate((selector) => {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      )
      return Array.from(
        { length: result.snapshotLength },
        (_, i) => (result.snapshotItem(i) as Element).closest('table')?.id,
      )
    }, mainSelector)
    expect(matchedRowTableIds).toEqual(
      Array.from({ length: TABLE_LAYOUTS_PAGE_COUNTS.layoutOuter }, () => 'layout-outer'),
    )
  })
})
