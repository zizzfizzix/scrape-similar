import { expect, test, TestHelpers } from './fixtures'

/**
 * Tests specific to the Options page functionality that aren't covered by
 * other consolidated test files (analytics-consent.spec.ts, debug-mode.spec.ts).
 */

test.describe('Options page', () => {
  test('loads correctly and shows expected title', async ({ context, extensionId }) => {
    const page = await TestHelpers.openOptionsPage(context, extensionId)
    await expect(page).toHaveTitle('Scrape Similar - Settings')
  })
})
