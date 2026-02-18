import { getPresets, setPresets } from '@/utils/storage'
import type { Preset } from '@/utils/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing'

const mockPreset: Preset = {
  id: 'test-preset-1',
  name: 'Test Preset',
  config: {
    mainSelector: '//div',
    columns: [
      { name: 'Title', selector: './/h2' },
      { name: 'Link', selector: '@href' },
    ],
  },
  createdAt: Date.now(),
}

describe('user presets storage', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('getPresets returns empty array when nothing stored', async () => {
    const presets = await getPresets()
    expect(presets).toEqual([])
  })

  it('setPresets writes and getPresets returns the same data', async () => {
    const toStore: Preset[] = [mockPreset]
    const ok = await setPresets(toStore)
    expect(ok).toBe(true)
    const presets = await getPresets()
    expect(presets).toHaveLength(1)
    expect(presets[0]).toEqual(mockPreset)
  })

  it('setPresets replaces existing presets', async () => {
    await setPresets([mockPreset])
    const second: Preset = { ...mockPreset, id: 'test-preset-2', name: 'Second' }
    await setPresets([second])
    const presets = await getPresets()
    expect(presets).toHaveLength(1)
    expect(presets[0].id).toBe('test-preset-2')
  })
})
