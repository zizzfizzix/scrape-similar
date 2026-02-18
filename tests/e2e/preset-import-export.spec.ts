import path from 'path'
import { expect, test, TestHelpers } from './fixtures'

const FIXTURES_DIR = path.join(process.cwd(), 'tests/e2e/fixtures')
const PRESET_VALID = path.join(FIXTURES_DIR, 'preset-valid.json')
const PRESET_INVALID_SYNTAX = path.join(FIXTURES_DIR, 'preset-invalid-syntax.json')
const PRESET_INVALID_VERSION = path.join(FIXTURES_DIR, 'preset-invalid-version.json')
const PRESET_WITH_SYSTEM_ID = path.join(FIXTURES_DIR, 'preset-with-system-id.json')

test.describe('Preset import/export', () => {
  test.describe('Options page', () => {
    test('Export downloads a JSON file with version and presets', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      await TestHelpers.setUserPresets(serviceWorker, [
        {
          id: 'export-test-1',
          name: 'Export Test',
          config: { mainSelector: '//div', columns: [{ name: 'X', selector: '.' }] },
          createdAt: 1000,
        },
      ])

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      await expect(page.getByText('User presets')).toBeVisible()
      await expect(page.getByRole('button', { name: /export/i })).toBeVisible()

      const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
      await page.getByRole('button', { name: /export/i }).click()
      const download = await downloadPromise

      const filename = download.suggestedFilename()
      expect(filename).toBe('scrape-similar-presets.json')

      const stream = await download.createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream!) {
        chunks.push(Buffer.from(chunk))
      }
      const body = Buffer.concat(chunks).toString('utf-8')
      const data = JSON.parse(body) as { version: number; presets: unknown[] }
      expect(data.version).toBe(1)
      expect(Array.isArray(data.presets)).toBe(true)
      expect(data.presets).toHaveLength(1)
      expect((data.presets[0] as { id: string }).id).toBe('export-test-1')
    })

    test('Import shows overwrite confirmation and cancelling leaves presets unchanged', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const initial = [
        {
          id: 'unchanged-1',
          name: 'Unchanged',
          config: { mainSelector: '//div', columns: [{ name: 'A', selector: '.' }] },
          createdAt: 2000,
        },
      ]
      await TestHelpers.setUserPresets(serviceWorker, initial)

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      await expect(page.getByText('User presets')).toBeVisible()
      await expect(page.getByRole('button', { name: /import/i })).toBeVisible()

      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(PRESET_VALID)

      await expect(
        page.getByRole('dialog').getByText(/importing will replace all your user presets/i),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible()
      await page.getByRole('button', { name: /cancel/i }).click()

      await expect(page.getByRole('dialog')).toBeHidden()
      const after = await TestHelpers.getUserPresets(serviceWorker)
      expect(after).toHaveLength(1)
      expect((after[0] as { id: string }).id).toBe('unchanged-1')
    })

    test('Import confirm replaces presets in storage', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      await TestHelpers.setUserPresets(serviceWorker, [
        {
          id: 'old-1',
          name: 'Old',
          config: { mainSelector: '//x', columns: [] },
          createdAt: 0,
        },
      ])

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(PRESET_VALID)

      await expect(page.getByRole('dialog').getByText(/importing will replace/i)).toBeVisible()
      await page.getByRole('button', { name: /^import$/i }).click()

      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 })
      const after = await TestHelpers.getUserPresets(serviceWorker)
      expect(after).toHaveLength(1)
      expect((after[0] as { id: string }).id).toBe('e2e-user-1')
    })

    test('Import invalid JSON shows error and leaves storage unchanged', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const initial = [
        { id: 'stay', name: 'Stay', config: { mainSelector: '//x', columns: [] }, createdAt: 0 },
      ]
      await TestHelpers.setUserPresets(serviceWorker, initial)

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(PRESET_INVALID_SYNTAX)

      await expect(page.getByText(/failed to read preset file|invalid json/i)).toBeVisible({
        timeout: 3000,
      })
      const after = await TestHelpers.getUserPresets(serviceWorker)
      expect(after).toHaveLength(1)
      expect((after[0] as { id: string }).id).toBe('stay')
    })

    test('Import invalid version shows error and leaves storage unchanged', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      const initial = [
        { id: 'stay', name: 'Stay', config: { mainSelector: '//x', columns: [] }, createdAt: 0 },
      ]
      await TestHelpers.setUserPresets(serviceWorker, initial)

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(PRESET_INVALID_VERSION)

      await expect(page.getByText(/unsupported|invalid/i)).toBeVisible({ timeout: 3000 })
      const after = await TestHelpers.getUserPresets(serviceWorker)
      expect(after).toHaveLength(1)
    })

    test('Import with system preset IDs shows skipped message and only imports user presets', async ({
      context,
      extensionId,
      serviceWorker,
    }) => {
      await TestHelpers.dismissAnalyticsConsent(serviceWorker)
      await TestHelpers.setUserPresets(serviceWorker, [])

      const page = await TestHelpers.openOptionsPage(context, extensionId)
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(PRESET_WITH_SYSTEM_ID)

      await expect(
        page
          .getByRole('dialog')
          .getByText(/preset\(s\) were skipped because they match system presets/i),
      ).toBeVisible()
      await page.getByRole('button', { name: /^import$/i }).click()

      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 3000 })
      const after = await TestHelpers.getUserPresets(serviceWorker)
      expect(after).toHaveLength(1)
      expect((after[0] as { id: string }).id).toBe('e2e-user-only')
    })
  })
})
