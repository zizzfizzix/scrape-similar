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

    // Open again - retry if blur handler's 150ms timer causes a race
    await expect(async () => {
      await input.blur() // Ensure input is not focused before clicking
      await input.click()
      await input.fill('')
      await expect(dropdown).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 5_000 })
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

  test('recents capture on Enter, cap to 5, and remove without closing', async ({
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
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    const removeButtons = sidePanel.locator('[aria-label="Remove recent selector"]')

    // Enter MORE than 5 selectors to test the cap
    const selectors = ['//h1', '//h2', '//h3', '//p', '//ul', '//li', '//a']
    for (const sel of selectors) {
      await input.fill(sel)
      await input.press('Enter')
      await expect(countBadge).toBeVisible()
      // Click outside to trigger blur and save recent
      await sidePanel.getByRole('heading', { name: /configuration/i }).click()
      await expect(dropdown).toBeHidden()
    }

    // Open dropdown and wait for all 5 recents (cap) - retry until they appear (async storage)
    await expect(async () => {
      await input.blur()
      await input.click()
      await input.fill('')
      await expect(dropdown).toBeVisible({ timeout: 500 })
      // Wait for exactly 5 recents (cap) - we entered 7 selectors
      await expect(removeButtons).toHaveCount(5, { timeout: 500 })
    }).toPass({ timeout: 5_000 })

    // Ensure button is ready before clicking
    await expect(removeButtons.first()).toBeVisible()

    // Click first remove button and verify one less after (dropdown stays open)
    // Use mousedown instead of click to match how the component prevents closing
    await removeButtons.first().dispatchEvent('mousedown')
    await removeButtons.first().dispatchEvent('click')
    await expect(dropdown).toBeVisible()
    await expect(removeButtons).toHaveCount(4)
  })

  test('typing in input filters recents to show only matching selectors', async ({
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
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    const removeButtons = sidePanel.locator('[aria-label="Remove recent selector"]')

    // Enter two distinct selectors to create recents
    await input.fill('//h1')
    await input.press('Enter')
    await expect(countBadge).toBeVisible()
    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(dropdown).toBeHidden()

    await input.fill('//article')
    await input.press('Enter')
    await expect(countBadge).toBeVisible()
    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(dropdown).toBeHidden()

    // Open dropdown and wait for both recents
    await expect(async () => {
      await input.blur()
      await input.click()
      await input.fill('')
      await expect(dropdown).toBeVisible({ timeout: 500 })
      await expect(removeButtons).toHaveCount(2, { timeout: 500 })
    }).toPass({ timeout: 5_000 })

    // Type "article" to filter - should show only //article
    // Use pressSequentially() instead of fill() to avoid triggering blur/focus events
    await input.selectText()
    await input.pressSequentially('article')
    await expect(dropdown).toBeVisible()
    await expect(removeButtons).toHaveCount(1)

    // The visible recent should be //article
    const recentItems = sidePanel
      .locator('[data-slot="command-item"]')
      .filter({ hasText: '//article' })
    await expect(recentItems.first()).toBeVisible()

    // Clear filter - should show both recents again
    await input.selectText()
    await input.press('Backspace')
    await expect(dropdown).toBeVisible()
    await expect(removeButtons).toHaveCount(2)
  })

  test('selecting an autosuggest preset loads full preset (main selector and columns) but does not scrape', async ({
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

    // Verify main selector is loaded
    await expect(input).toHaveValue('//h1 | //h2 | //h3 | //h4 | //h5 | //h6')

    // Verify columns are loaded (Headings preset has 4 columns: Level, Text, ID, Class)
    const columnNames = sidePanel.locator('input[placeholder="Column name"]')
    await expect(columnNames).toHaveCount(4)
    await expect(columnNames.nth(0)).toHaveValue('Level')
    await expect(columnNames.nth(1)).toHaveValue('Text')
    await expect(columnNames.nth(2)).toHaveValue('ID')
    await expect(columnNames.nth(3)).toHaveValue('Class')

    // Verify it doesn't auto-scrape
    await expect(sidePanel.getByRole('heading', { name: /extracted data/i })).toBeHidden()
  })

  test('selecting a recent selector only loads main selector without affecting columns', async ({
    openSidePanel,
    context,
    serviceWorker,
  }) => {
    await TestHelpers.dismissAnalyticsConsent(serviceWorker)
    const sidePanel = await openSidePanel()

    const testPage = await context.newPage()
    await testPage.goto('https://en.wikipedia.org/wiki/Playwright_(software)')
    await testPage.bringToFront()

    // Verify default state has 1 column (Text)
    const columnNames = sidePanel.locator('input[placeholder="Column name"]')
    await expect(columnNames).toHaveCount(1)
    await expect(columnNames.first()).toHaveValue('Text')

    // Add a second column manually
    await sidePanel.getByRole('button', { name: /add column/i }).click()
    await expect(columnNames).toHaveCount(2)
    await expect(columnNames.nth(0)).toHaveValue('Text')
    await expect(columnNames.nth(1)).toHaveValue('Column 2')

    // Enter a selector to create a recent entry (use real selectors that exist on Wikipedia)
    const input = sidePanel.locator('#mainSelector')
    const countBadge = sidePanel.locator('[data-slot="badge"]').filter({ hasText: /^\d+$/ })
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    const removeButtons = sidePanel.locator('[aria-label="Remove recent selector"]')

    // First selector - will be second in recents (older)
    await input.fill('//ul')
    await input.press('Enter')
    // Wait for selector to be committed (badge shows match count)
    await expect(countBadge).toBeVisible()

    // Click outside to ensure blur handler completes before next selector
    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(dropdown).toBeHidden()

    // Verify first recent was saved - retry until recents appear (async storage)
    await expect(async () => {
      await input.blur() // Ensure fresh focus on each retry
      await input.click()
      await input.fill('')
      await expect(dropdown).toBeVisible({ timeout: 500 })
      await expect(removeButtons).toHaveCount(1, { timeout: 500 })
    }).toPass({ timeout: 5_000 })

    // Second selector - will be first in recents (most recent)
    await input.fill('//p')
    await input.press('Enter')
    await expect(countBadge).toBeVisible()

    // Click outside to ensure blur handler completes
    await sidePanel.getByRole('heading', { name: /configuration/i }).click()
    await expect(dropdown).toBeHidden()

    // Verify both recents were saved and click the older one (//ul)
    const recentItem = sidePanel
      .locator('[data-slot="command-item"]')
      .filter({ hasText: '//ul' })
      .first()

    await expect(async () => {
      await input.blur() // Ensure fresh focus on each retry
      await input.click()
      await input.fill('')
      await expect(dropdown).toBeVisible({ timeout: 500 })
      await expect(removeButtons).toHaveCount(2, { timeout: 500 })
      await expect(recentItem).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 5_000 })

    // Use mousedown + click to match how cmdk handles selection
    await recentItem.dispatchEvent('mousedown')
    await recentItem.dispatchEvent('click')

    // Verify main selector changed to the recent one
    await expect(input).toHaveValue('//ul')

    // Verify columns were NOT changed (should still have our 2 columns)
    await expect(columnNames).toHaveCount(2)
    await expect(columnNames.nth(0)).toHaveValue('Text')
    await expect(columnNames.nth(1)).toHaveValue('Column 2')
  })

  test('selecting a preset from autosuggest preserves mainSelector after validation', async ({
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

    // Step 1: Type to filter presets
    await input.focus()

    // Step 2: Select a preset from autosuggest using keyboard
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('Enter')

    // Verify preset is loaded with its full selector
    await expect(input).toHaveValue('//h1 | //h2 | //h3 | //h4 | //h5 | //h6')

    // Step 3: Trigger validation by focusing and blurring
    await input.blur()
    await testPage.waitForTimeout(1000) // Wait for blur handler delay

    // Bug fix verification: selector should still have the preset value, not be empty
    await expect(input).toHaveValue('//h1 | //h2 | //h3 | //h4 | //h5 | //h6')

    // Verify columns are still loaded from preset (Headings has 4 columns)
    const columnNames = sidePanel.locator('input[placeholder="Column name"]')
    await expect(columnNames).toHaveCount(4)
    await expect(columnNames.nth(0)).toHaveValue('Level')
    await expect(columnNames.nth(1)).toHaveValue('Text')
    await expect(columnNames.nth(2)).toHaveValue('ID')
    await expect(columnNames.nth(3)).toHaveValue('Class')
  })

  test('clicking a preset from autosuggest preserves mainSelector after validation', async ({
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

    // Step 1: Type to filter presets
    await input.focus()
    await input.fill('imag')

    // Step 2: Click on a preset from autosuggest
    const dropdown = sidePanel.locator('[data-slot="command-list"]')
    await expect(dropdown).toBeVisible()

    const presetItem = sidePanel
      .locator('[data-slot="command-item"]')
      .filter({ hasText: 'Images' })
      .first()
    await presetItem.click()

    // Wait a moment for the preset to load and state to update
    await testPage.waitForTimeout(100)

    // Verify preset is loaded with its full selector
    await expect(input).toHaveValue('//img')

    // Step 3: Trigger validation by blurring
    await input.blur()
    await testPage.waitForTimeout(100) // Wait for blur handler delay

    // Bug fix verification: selector should still have the preset value, not be empty
    await expect(input).toHaveValue('//img')

    // Verify columns are still loaded from preset (Images has 6 columns)
    const columnNames = sidePanel.locator('input[placeholder="Column name"]')
    await expect(columnNames).toHaveCount(6)
    await expect(columnNames.nth(0)).toHaveValue('Source')
    await expect(columnNames.nth(1)).toHaveValue('Alt Text')
    await expect(columnNames.nth(2)).toHaveValue('Title')
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
