import { MESSAGE_TYPES } from '@/utils/types'
import type { Page } from '@playwright/test'
import { expect, SCRAPE_TARGET_PAGE, test, TestHelpers } from './fixtures'

/**
 * Storage writes take a Web Lock named after their key. These specs hold that
 * lock from one extension page and drive a write from another context. The
 * write showing up as a pending request in the holder's `navigator.locks.query()`
 * proves both contexts share one lock manager; the stored value staying put
 * until the holder lets go proves the write waits for it.
 */

const holdLock = (page: Page, name: string) =>
  page.evaluate(
    (lockName) =>
      new Promise<void>((granted) => {
        navigator.locks
          .request(lockName, () => {
            granted()
            return new Promise<void>((release) => {
              ;(window as unknown as { __releaseLock: () => void }).__releaseLock = release
            })
          })
          .catch(() => {})
      }),
    name,
  )

const releaseLock = (page: Page) =>
  page.evaluate(() => (window as unknown as { __releaseLock: () => void }).__releaseLock())

const isLockRequested = (page: Page, name: string) =>
  page.evaluate(
    async (lockName) =>
      (await navigator.locks.query()).pending?.some((lock) => lock.name === lockName) ?? false,
    name,
  )

test.describe('Storage lock across extension contexts', () => {
  test('a side panel write waits for a lock held by the options page', async ({
    context,
    extensionId,
    openSidePanel,
    serviceWorker,
    fixturePageUrl,
  }) => {
    const key = 'sync:system_preset_status'
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const holder = await TestHelpers.openOptionsPage(context, extensionId)
    await holdLock(holder, key)

    const sidePanel = await openSidePanel()
    const testPage = await context.newPage()
    await testPage.goto(fixturePageUrl(SCRAPE_TARGET_PAGE))
    await testPage.bringToFront()

    await sidePanel.locator('#mainSelector').fill('headings')
    await sidePanel.getByLabel('Hide preset "Headings (H1-H6)"').click()
    await sidePanel.getByRole('button', { name: 'Hide', exact: true }).click()

    await expect.poll(() => isLockRequested(holder, key)).toBe(true)
    const readStatus = () =>
      serviceWorker.evaluate(
        async () => (await chrome.storage.sync.get('system_preset_status')).system_preset_status,
      )
    expect(await readStatus()).toBeUndefined()

    await releaseLock(holder)

    await expect.poll(readStatus).toEqual({ 'sys-headings': false })
  })

  test('a background write waits for a lock held by an extension page', async ({
    context,
    extensionId,
    serviceWorker,
    fixturePageUrl,
  }) => {
    // With consent undecided, the content script hands its picker event to the
    // background, which appends it to the queue under the queue's lock.
    const key = 'local:event_queue'
    await serviceWorker.evaluate(() => chrome.storage.sync.remove('analytics_consent'))
    const holder = await TestHelpers.openOptionsPage(context, extensionId)
    await holdLock(holder, key)

    const testPageUrl = fixturePageUrl(SCRAPE_TARGET_PAGE)
    const testPage = await context.newPage()
    await testPage.goto(testPageUrl)

    const readQueuedNames = () =>
      serviceWorker.evaluate(async () => {
        const { event_queue: queue = [] } = await chrome.storage.local.get('event_queue')
        return (queue as { name: string }[]).map((event) => event.name)
      })
    // `ANALYTICS_EVENTS.PICKER_MODE_ENABLE`; its module needs WXT's auto-imports.
    const pickerEvent = 'picker_mode_enable'

    await serviceWorker.evaluate(
      async ({ url, type }) => {
        const [tab] = await chrome.tabs.query({ url })
        await chrome.tabs.sendMessage(tab!.id!, { type, payload: {} })
      },
      { url: testPageUrl, type: MESSAGE_TYPES.ENABLE_PICKER_MODE },
    )

    await expect(testPage.locator('html')).toHaveClass(/scrape-similar-picker-active/)
    await expect.poll(() => isLockRequested(holder, key)).toBe(true)
    expect(await readQueuedNames()).not.toContain(pickerEvent)

    await releaseLock(holder)

    await expect.poll(readQueuedNames).toContain(pickerEvent)
  })
})
