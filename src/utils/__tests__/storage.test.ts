import {
  deletePreset,
  getAllPresets,
  getPresets,
  getRecentMainSelectors,
  getSystemPresetStatus,
  initializeStorage,
  pushRecentMainSelector,
  removeRecentMainSelector,
  savePreset,
  setPresets,
  setRecentMainSelectors,
  setSystemPresetStatus,
  STORAGE_KEYS,
  userPresetsStorage,
} from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import { SYSTEM_PRESET_STATUS_KEY, type Preset } from '@/utils/types'
import log from 'loglevel'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { storage } from 'wxt/utils/storage'

const preset = (id: string, name = id): Preset => ({
  id,
  name,
  config: { mainSelector: '//div', columns: [{ name: 'Title', selector: './/h2' }] },
  createdAt: 1_700_000_000_000,
})

const ids = (presets: Preset[]) => presets.map((p) => p.id)

beforeEach(async () => {
  fakeBrowser.reset()
  // The versioned storage item caches its value in memory, so fakeBrowser.reset()
  // alone leaves the previous test's presets visible. Write the empty list back.
  await userPresetsStorage.setValue([])
})

describe('savePreset', () => {
  it('appends a new preset', async () => {
    expect(await savePreset(preset('a'))).toBe(true)

    expect(ids(await getPresets())).toEqual(['a'])
  })

  it('appends alongside existing presets', async () => {
    await savePreset(preset('a'))
    await savePreset(preset('b'))

    expect(ids(await getPresets())).toEqual(['a', 'b'])
  })

  it('updates in place when the id already exists', async () => {
    await savePreset(preset('a', 'Original'))
    await savePreset(preset('b'))

    await savePreset(preset('a', 'Renamed'))

    const presets = await getPresets()
    expect(ids(presets)).toEqual(['a', 'b'])
    expect(presets[0]?.name).toBe('Renamed')
  })

  it('reports failure when the write is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValueOnce(failure)

    expect(await savePreset(preset('a'))).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error saving preset to storage:', failure)
  })
})

describe('deletePreset', () => {
  it('removes only the named preset', async () => {
    await setPresets([preset('a'), preset('b')])

    expect(await deletePreset('a')).toBe(true)
    expect(ids(await getPresets())).toEqual(['b'])
  })

  it('succeeds when the preset does not exist', async () => {
    await setPresets([preset('a')])

    expect(await deletePreset('missing')).toBe(true)
    expect(ids(await getPresets())).toEqual(['a'])
  })

  it('reports failure when the write is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValueOnce(failure)

    expect(await deletePreset('a')).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error deleting preset from storage:', failure)
  })
})

describe('getPresets', () => {
  it('returns an empty list and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(userPresetsStorage, 'getValue').mockRejectedValueOnce(failure)

    expect(await getPresets()).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith('Error getting presets from storage:', failure)
  })
})

describe('setPresets', () => {
  it('reports failure when the write is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(userPresetsStorage, 'setValue').mockRejectedValueOnce(failure)

    expect(await setPresets([preset('a')])).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error setting presets in storage:', failure)
  })
})

describe('initializeStorage', () => {
  it('leaves an empty store untouched', async () => {
    await initializeStorage()

    expect(await getPresets()).toEqual([])
  })

  it('leaves existing presets untouched', async () => {
    await setPresets([preset('a')])

    await initializeStorage()

    expect(ids(await getPresets())).toEqual(['a'])
  })

  it('logs and swallows a read failure', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    vi.spyOn(userPresetsStorage, 'getValue').mockRejectedValue(new Error('storage unavailable'))

    await expect(initializeStorage()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('system preset status', () => {
  it('starts out empty', async () => {
    expect(await getSystemPresetStatus()).toEqual({})
  })

  it('round-trips a status map', async () => {
    await setSystemPresetStatus({ 'system-1': false })

    expect(await getSystemPresetStatus()).toEqual({ 'system-1': false })
  })

  it('returns an empty map and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(failure)

    expect(await getSystemPresetStatus()).toEqual({})
    expect(errorSpy).toHaveBeenCalledWith(
      'Error getting system preset status from storage:',
      failure,
    )
  })

  it('logs and swallows a write failure', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(failure)

    await expect(setSystemPresetStatus({ 'system-1': false })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error setting system preset status in storage:', failure)
  })
})

describe('getAllPresets', () => {
  it('lists user presets before the enabled system presets', async () => {
    await setPresets([preset('mine')])

    const all = await getAllPresets()

    expect(all[0]?.id).toBe('mine')
    expect(all).toHaveLength(1 + SYSTEM_PRESETS.length)
  })

  it('enables every system preset by default', async () => {
    expect(await getAllPresets()).toHaveLength(SYSTEM_PRESETS.length)
  })

  it('omits system presets explicitly disabled in the status map', async () => {
    const [first] = SYSTEM_PRESETS
    await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, { [first!.id]: false })

    const all = await getAllPresets()

    expect(ids(all)).not.toContain(first!.id)
    expect(all).toHaveLength(SYSTEM_PRESETS.length - 1)
  })

  it('keeps system presets explicitly enabled in the status map', async () => {
    const [first] = SYSTEM_PRESETS
    await storage.setItem(`sync:${SYSTEM_PRESET_STATUS_KEY}`, { [first!.id]: true })

    expect(ids(await getAllPresets())).toContain(first!.id)
  })
})

describe('recent main selectors', () => {
  const read = () => storage.getItem<string[]>(`local:${STORAGE_KEYS.RECENT_MAIN_SELECTORS}`)

  it('starts out empty', async () => {
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('round-trips a list', async () => {
    await setRecentMainSelectors(['//a', '//div'])

    expect(await getRecentMainSelectors()).toEqual(['//a', '//div'])
  })

  it('pushes the newest selector to the front', async () => {
    await pushRecentMainSelector('//a')
    await pushRecentMainSelector('//div')

    expect(await getRecentMainSelectors()).toEqual(['//div', '//a'])
  })

  it('moves a repeated selector back to the front without duplicating it', async () => {
    await pushRecentMainSelector('//a')
    await pushRecentMainSelector('//div')
    await pushRecentMainSelector('//a')

    expect(await getRecentMainSelectors()).toEqual(['//a', '//div'])
  })

  it('trims surrounding whitespace before storing', async () => {
    await pushRecentMainSelector('  //a  ')

    expect(await getRecentMainSelectors()).toEqual(['//a'])
  })

  it('ignores a blank selector', async () => {
    await pushRecentMainSelector('   ')

    expect(await read()).toBeNull()
  })

  it('keeps only the five most recent selectors', async () => {
    for (const selector of ['//1', '//2', '//3', '//4', '//5', '//6']) {
      await pushRecentMainSelector(selector)
    }

    expect(await getRecentMainSelectors()).toEqual(['//6', '//5', '//4', '//3', '//2'])
  })

  it('removes a selector', async () => {
    await setRecentMainSelectors(['//a', '//div'])

    await removeRecentMainSelector('//a')

    expect(await getRecentMainSelectors()).toEqual(['//div'])
  })

  it('leaves the list alone when removing a selector that is not there', async () => {
    await setRecentMainSelectors(['//a'])

    await removeRecentMainSelector('//missing')

    expect(await getRecentMainSelectors()).toEqual(['//a'])
  })

  it('returns an empty list and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(failure)

    expect(await getRecentMainSelectors()).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith('Error getting recent main selectors:', failure)
  })

  it('logs and swallows a write failure', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(storage, 'setItem').mockRejectedValueOnce(failure)

    await expect(setRecentMainSelectors(['//a'])).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error setting recent main selectors:', failure)
  })

  it('logs and swallows a failure while pushing', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(storage, 'getItem').mockRejectedValue(failure)

    await expect(pushRecentMainSelector('//a')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error getting recent main selectors:', failure)
  })

  it('logs and swallows a failure while removing', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await setRecentMainSelectors(['//a'])
    const failure = new Error('quota exceeded')
    vi.spyOn(storage, 'setItem').mockRejectedValue(failure)

    await expect(removeRecentMainSelector('//a')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error setting recent main selectors:', failure)
  })
})
