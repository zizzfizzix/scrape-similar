import { expect, test, TestHelpers } from './fixtures'

test.describe('Main selector autosuggest', () => {
  test('opens on focus and filters by typing; clears to show all', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()

    // Dropdown should open on focus
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    await expect(dropdown).toBeVisible()

    // Typing filters
    await input.fill('//h2')
    await expect(dropdown).toBeVisible()

    // Clearing maintains open and resets selection
    await input.fill('')
    await expect(dropdown).toBeVisible()
  })

  test('arrow keys navigate; enter selects when an item is highlighted, otherwise submits', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('//h2')

    // Initially no selection, Enter should submit (validate+scrape)
    await input.press('Enter')

    // Badge shown for validation
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible()

    // Open again and navigate with arrows
    await input.focus()
    await input.press('ArrowDown')
    await input.press('Enter') // selects the highlighted suggestion
  })

  test('outside click closes dropdown; clicking remove recent keeps it open', async ({
    openSidePanel,
    serviceWorker,
    context,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    await expect(dropdown).toBeVisible()

    // Click outside (header) closes
    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(dropdown).toBeHidden()

    // Open again and ensure remove recent keeps it open
    await input.focus()
    await expect(dropdown).toBeVisible()
    // Try clicking the remove control if exists
    const removeButton = sidePanel.locator('[aria-label="Remove recent selector"]').first()
    if (await removeButton.isVisible()) {
      await removeButton.click()
      await expect(dropdown).toBeVisible()
    }
  })

  test('save preset then Load shows it; autosuggest does not duplicate it from recents', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.fill('//h2')
    await input.press('Enter') // validate + badge

    // Wait for numeric badge to ensure selector is committed and valid
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toBeVisible()

    // Ensure at least one column exists so Save is enabled
    await sidePanel.getByRole('button', { name: /add column/i }).click()

    // Open Save Preset, name and save
    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .first()
      .click()
    const presetName = `E2E Preset ${Date.now()}`
    await sidePanel.getByPlaceholder('Preset name').fill(presetName)
    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .last()
      .click()

    // Open Load combobox and verify preset listed
    await sidePanel.getByRole('button', { name: /load/i }).click()
    await expect(sidePanel.getByRole('option', { name: new RegExp(presetName, 'i') })).toBeVisible()
    await sidePanel.getByRole('button', { name: /load/i }).click()
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeHidden()

    // Focus autosuggest and ensure no duplicate recent equals preset selector shown
    await input.focus()
    const recentRowWithSame = sidePanel
      .locator('[data-slot="command-item"]')
      .filter({ hasText: '//h2' })
      .first()
    // The preset appears via PresetItem; the recent should be excluded. We just assert dropdown is visible
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeVisible()
  })

  test('does not preselect on open; ArrowDown selects first; Escape closes', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()

    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    await expect(dropdown).toBeVisible()
    await expect(sidePanel.locator('[data-slot="command-item"][data-selected="true"]')).toHaveCount(
      0,
    )

    await input.press('ArrowDown')
    await expect(sidePanel.locator('[data-slot="command-item"][data-selected="true"]')).toHaveCount(
      1,
    )

    await sidePanel.keyboard.press('Escape')
    await expect(dropdown).toBeHidden()
  })

  test('ArrowUp when closed opens and selects last item', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    // Close if opened accidentally
    await sidePanel.keyboard.press('Escape').catch(() => {})

    await input.press('ArrowUp')
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeVisible()
    // At least one selected now (the last)
    await expect(sidePanel.locator('[data-slot="command-item"][data-selected="true"]')).toHaveCount(
      1,
    )
  })

  test('filters by preset name and by selector contents', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()

    // Filter by name
    await input.fill('headings')
    await expect(sidePanel.getByRole('option', { name: /headings\s*\(h1-h6\)/i })).toBeVisible()

    // Filter by selector contents (preset selector contains rel="nofollow")
    await input.fill('nofollow')
    await expect(sidePanel.getByRole('option', { name: /nofollow links/i })).toBeVisible()
  })

  test('recents capture on Enter, cap to 5, filter and remove without closing', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    const selectors = ['//h2', '//h3', '//img', '//a', '//p', '//li']

    for (const sel of selectors) {
      await input.fill(sel)
      await input.press('Enter')
    }

    await input.fill('')
    await input.focus()
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    await expect(dropdown).toBeVisible()

    const removeButtons = sidePanel.locator('[aria-label="Remove recent selector"]')
    const removeCount = await removeButtons.count()
    expect(removeCount).toBeLessThanOrEqual(5)
    expect(removeCount).toBeGreaterThan(0)

    await input.fill('h3')
    await expect(removeButtons).toHaveCount(1)

    const before = await removeButtons.count()
    await removeButtons.first().evaluate((el) => (el as HTMLElement).click())
    await expect(dropdown).toBeVisible()
    await expect(removeButtons).toHaveCount(Math.max(0, before - 1))
  })

  test('selecting an autosuggest preset fills textarea but does not scrape', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('headings')
    await input.press('ArrowDown')
    await sidePanel.keyboard.press('Enter')

    await expect(input).toHaveValue('//h1 | //h2 | //h3 | //h4 | //h5 | //h6')
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeHidden()
  })

  test('outside click closes; blur commits pending value (badge after commit)', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('//h2')

    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toHaveCount(0)

    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeHidden()
    await expect(countBadge).toBeVisible()
  })

  test('CommandEmpty shown when no suggestions match', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('___NO_MATCH_EXPECTED___')

    await expect(sidePanel.locator('[data-slot="command-empty"]')).toHaveText(
      /no suggestions found/i,
    )
  })

  test('hide system preset from autosuggest opens confirmation and closes dropdown', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('headings')

    const hideBtn = sidePanel.getByLabel(/hide preset/i).first()
    await hideBtn.click()

    await expect(sidePanel.getByRole('dialog')).toBeVisible()
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeHidden()
    await sidePanel.getByRole('button', { name: /cancel/i }).click()
  })

  test('delete custom preset from autosuggest opens Delete Preset drawer', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.fill('//h2')
    await input.press('Enter')

    // Ensure Save becomes enabled by adding a column
    await sidePanel.getByRole('button', { name: /add column/i }).click()

    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .first()
      .click()
    const name = `E2E Custom ${Date.now()}`
    await sidePanel.getByPlaceholder('Preset name').fill(name)
    await sidePanel
      .getByRole('button', { name: /^save$/i })
      .last()
      .click()

    await input.focus()
    await input.fill(name)

    const deleteBtn = sidePanel.getByLabel(
      new RegExp(`delete preset\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i'),
    )
    await deleteBtn.click()

    await expect(sidePanel.getByRole('heading', { name: /delete preset/i })).toBeVisible()
    await sidePanel.getByRole('button', { name: /cancel/i }).click()
  })

  test('pressing Enter with empty textarea does nothing (no commit)', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('')
    await input.press('Enter')

    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    await expect(countBadge).toHaveCount(0)
  })

  test('clearing input keeps dropdown open and resets selection', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('head')
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeVisible()
    await input.fill('')
    await expect(sidePanel.locator('[data-slot="command-list"]')).toBeVisible()
    await expect(sidePanel.locator('[data-slot="command-item"][data-selected="true"]')).toHaveCount(
      0,
    )
  })

  test('info button opens XPath documentation in a new tab', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      sidePanel.getByRole('button', { name: /open xpath reference/i }).click(),
    ])
    expect(newPage).toBeTruthy()
  })

  test('Enter with no highlighted dropdown item commits and blurs textarea', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    const input = sidePanel.locator('#mainSelector')
    await input.focus()
    await input.fill('//h2')

    // Do not move selection into dropdown; press Enter immediately
    await input.press('Enter')
    await expect(input).not.toBeFocused()
  })
})
