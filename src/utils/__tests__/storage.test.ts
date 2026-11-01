import {
  deletePreset,
  getAllPresets,
  getPresets,
  getRecentMainSelectors,
  getSystemPresetStatus,
  hideSystemPreset,
  initializeStorage,
  pushRecentMainSelector,
  removeRecentMainSelector,
  resetSystemPresetStatus,
  savePreset,
  setPresets,
  userPresetsItem,
} from '@/utils/storage'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import { type Preset } from '@/utils/types'
import { flushMicrotasks } from '@@/tests/support/flush-microtasks'
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
  await userPresetsItem.setValue([])
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
    vi.spyOn(userPresetsItem, 'setValue').mockRejectedValueOnce(failure)

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
    vi.spyOn(userPresetsItem, 'setValue').mockRejectedValueOnce(failure)

    expect(await deletePreset('a')).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error deleting preset from storage:', failure)
  })
})

describe('getPresets', () => {
  it('returns an empty list and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(userPresetsItem, 'getValue').mockRejectedValueOnce(failure)

    expect(await getPresets()).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith('Error getting presets from storage:', failure)
  })
})

describe('setPresets', () => {
  it('reports failure when the write is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(userPresetsItem, 'setValue').mockRejectedValueOnce(failure)

    expect(await setPresets([preset('a')])).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error setting presets in storage:', failure)
  })
})

describe('preset writes after a failed read', () => {
  beforeEach(() => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
  })

  it('does not save over the stored presets', async () => {
    await setPresets([preset('a')])
    vi.spyOn(userPresetsItem, 'getValue').mockRejectedValueOnce(new Error('unavailable'))

    expect(await savePreset(preset('b'))).toBe(false)

    expect(ids(await getPresets())).toEqual(['a'])
  })

  it('does not delete from the stored presets', async () => {
    await setPresets([preset('a'), preset('b')])
    vi.spyOn(userPresetsItem, 'getValue').mockRejectedValueOnce(new Error('unavailable'))

    expect(await deletePreset('a')).toBe(false)

    expect(ids(await getPresets())).toEqual(['a', 'b'])
  })
})

describe('overlapping preset writes', () => {
  it('keeps every preset from concurrent saves, in call order', async () => {
    await Promise.all(['a', 'b', 'c'].map((id) => savePreset(preset(id))))

    expect(ids(await getPresets())).toEqual(['a', 'b', 'c'])
  })

  it('applies a save and a delete that race each other', async () => {
    await setPresets([preset('a'), preset('b')])

    await Promise.all([savePreset(preset('c')), deletePreset('a')])

    expect(ids(await getPresets())).toEqual(['b', 'c'])
  })

  it('applies a save queued behind an import, in call order', async () => {
    await setPresets([preset('a')])
    const write = userPresetsItem.setValue.bind(userPresetsItem)
    // Holds the import's write back a macrotask; an unguarded save would read ['a'] meanwhile.
    vi.spyOn(userPresetsItem, 'setValue').mockImplementationOnce(async (value) => {
      await flushMicrotasks()
      await write(value)
    })

    await Promise.all([setPresets([preset('x')]), savePreset(preset('b'))])

    expect(ids(await getPresets())).toEqual(['x', 'b'])
  })

  it('applies an import queued behind a save, in call order', async () => {
    await setPresets([preset('a')])

    await Promise.all([savePreset(preset('b')), setPresets([preset('x')])])

    expect(ids(await getPresets())).toEqual(['x'])
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
    vi.spyOn(userPresetsItem, 'getValue').mockRejectedValue(new Error('storage unavailable'))

    await expect(initializeStorage()).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('system preset status', () => {
  it('starts out empty', async () => {
    expect(await getSystemPresetStatus()).toEqual({})
  })

  it('records a hidden system preset', async () => {
    await hideSystemPreset('system-1')

    expect(await getSystemPresetStatus()).toEqual({ 'system-1': false })
  })

  it('keeps every preset hidden by overlapping calls', async () => {
    await Promise.all([hideSystemPreset('system-1'), hideSystemPreset('system-2')])

    expect(await getSystemPresetStatus()).toEqual({ 'system-1': false, 'system-2': false })
  })

  it('shows every system preset again after a reset', async () => {
    await hideSystemPreset('system-1')

    await resetSystemPresetStatus()

    expect(await getSystemPresetStatus()).toEqual({})
  })

  it('applies a reset queued behind a hide, in call order', async () => {
    await Promise.all([hideSystemPreset('system-1'), resetSystemPresetStatus()])

    expect(await getSystemPresetStatus()).toEqual({})
  })

  it('returns an empty map and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(systemPresetStatusItem, 'getValue').mockRejectedValueOnce(failure)

    expect(await getSystemPresetStatus()).toEqual({})
    expect(errorSpy).toHaveBeenCalledWith(
      'Error getting system preset status from storage:',
      failure,
    )
  })

  it('logs and swallows a write failure', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('quota exceeded')
    vi.spyOn(systemPresetStatusItem, 'setValue').mockRejectedValueOnce(failure)

    await expect(hideSystemPreset('system-1')).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('Error setting system preset status in storage:', failure)
  })

  it('keeps the other hidden presets when the read fails', async () => {
    vi.spyOn(log, 'error').mockImplementation(() => {})
    await hideSystemPreset('system-1')
    vi.spyOn(systemPresetStatusItem, 'getValue').mockRejectedValueOnce(new Error('unavailable'))

    await expect(hideSystemPreset('system-2')).resolves.toBe(false)

    vi.mocked(systemPresetStatusItem.getValue).mockRestore()
    expect(await getSystemPresetStatus()).toEqual({ 'system-1': false })
  })

  it('logs and swallows a reset failure', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(systemPresetStatusItem, 'removeValue').mockRejectedValueOnce(failure)

    await expect(resetSystemPresetStatus()).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      'Error resetting system preset status in storage:',
      failure,
    )
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
    await storage.setItem(systemPresetStatusItem.key, { [first!.id]: false })

    const all = await getAllPresets()

    expect(ids(all)).not.toContain(first!.id)
    expect(all).toHaveLength(SYSTEM_PRESETS.length - 1)
  })

  it('keeps system presets explicitly enabled in the status map', async () => {
    const [first] = SYSTEM_PRESETS
    await storage.setItem(systemPresetStatusItem.key, { [first!.id]: true })

    expect(ids(await getAllPresets())).toContain(first!.id)
  })
})

describe('recent main selectors', () => {
  const read = () => storage.getItem<string[]>(recentMainSelectorsItem.key)

  it('starts out empty', async () => {
    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('reads a stored value that is not a list as no recents', async () => {
    await storage.setItem(recentMainSelectorsItem.key, 'not-a-list')

    expect(await getRecentMainSelectors()).toEqual([])
  })

  it('drops entries that are not strings', async () => {
    await storage.setItem(recentMainSelectorsItem.key, ['//a', null, 42, { x: 1 }, '//div'])

    expect(await getRecentMainSelectors()).toEqual(['//a', '//div'])
  })

  it('round-trips a list', async () => {
    await recentMainSelectorsItem.setValue(['//a', '//div'])

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
    await recentMainSelectorsItem.setValue(['//a', '//div'])

    await removeRecentMainSelector('//a')

    expect(await getRecentMainSelectors()).toEqual(['//div'])
  })

  it('leaves the list alone when removing a selector that is not there', async () => {
    await recentMainSelectorsItem.setValue(['//a'])

    await removeRecentMainSelector('//missing')

    expect(await getRecentMainSelectors()).toEqual(['//a'])
  })

  it('returns an empty list and logs when the read is rejected', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    vi.spyOn(recentMainSelectorsItem, 'getValue').mockRejectedValueOnce(failure)

    expect(await getRecentMainSelectors()).toEqual([])
    expect(errorSpy).toHaveBeenCalledWith('Error getting recent main selectors:', failure)
  })

  it('logs and swallows a failure while pushing', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    const failure = new Error('storage unavailable')
    await recentMainSelectorsItem.setValue(['//kept'])
    vi.spyOn(recentMainSelectorsItem, 'getValue').mockRejectedValue(failure)
    const setSpy = vi.spyOn(recentMainSelectorsItem, 'setValue')

    await expect(pushRecentMainSelector('//a')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error updating recent main selectors:', failure)
    // A failed read must not be written back as an empty list.
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('logs and swallows a failure while removing', async () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
    await recentMainSelectorsItem.setValue(['//a'])
    const failure = new Error('quota exceeded')
    vi.spyOn(recentMainSelectorsItem, 'setValue').mockRejectedValue(failure)

    await expect(removeRecentMainSelector('//a')).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith('Error updating recent main selectors:', failure)
  })

  it('keeps every selector from concurrent pushes, in call order', async () => {
    await Promise.all(['//1', '//2', '//3'].map((selector) => pushRecentMainSelector(selector)))

    expect(await getRecentMainSelectors()).toEqual(['//3', '//2', '//1'])
  })

  it('applies a push and a remove that race each other', async () => {
    await recentMainSelectorsItem.setValue(['//a', '//b'])

    await Promise.all([pushRecentMainSelector('//c'), removeRecentMainSelector('//a')])

    expect(await getRecentMainSelectors()).toEqual(['//c', '//b'])
  })
})

describe('storage items', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  // Existing installs hold their data under these keys; changing one orphans it.
  it('keeps the keys earlier versions stored values under', () => {
    expect({
      userPresets: userPresetsItem.key,
      systemPresetStatus: systemPresetStatusItem.key,
      recentMainSelectors: recentMainSelectorsItem.key,
      debugMode: debugModeItem.key,
      debugUnlocked: debugUnlockedItem.key,
      theme: themeItem.key,
      eventQueue: eventQueueItem.key,
      analyticsConsent: analyticsConsentItem.key,
      distinctId: distinctIdItem.key,
      sidePanelConfig: sidePanelConfigItem(42).key,
      demoScrapePending: demoScrapePendingItem(42).key,
    }).toEqual({
      userPresets: 'sync:user_presets',
      systemPresetStatus: 'sync:system_preset_status',
      recentMainSelectors: 'local:recent_main_selectors',
      debugMode: 'local:debugMode',
      debugUnlocked: 'local:debugUnlocked',
      theme: 'local:theme',
      eventQueue: 'local:event_queue',
      analyticsConsent: 'sync:analytics_consent',
      distinctId: 'local:distinct_id',
      sidePanelConfig: 'session:sidepanel_config_42',
      demoScrapePending: 'local:demo_scrape_pending_42',
    })
  })

  it('reads a value written under the old raw key', async () => {
    await storage.setItem('local:debugMode', true)
    await storage.setItem('session:sidepanel_config_7', { highlightMatchCount: 3 })

    expect(await debugModeItem.getValue()).toBe(true)
    expect(await sidePanelConfigItem(7).getValue()).toEqual({ highlightMatchCount: 3 })
  })

  it('reads an unset key as its default', async () => {
    expect(await debugModeItem.getValue()).toBe(false)
    expect(await themeItem.getValue()).toBe('system')
    expect(await eventQueueItem.getValue()).toEqual([])
    expect(await sidePanelConfigItem(7).getValue()).toBeNull()
  })

  it('defines each per-tab item once', () => {
    expect(sidePanelConfigItem(1)).toBe(sidePanelConfigItem(1))
    expect(sidePanelConfigItem(1)).not.toBe(sidePanelConfigItem(2))
  })

  it('defines a forgotten tab item afresh, under the same key', () => {
    const first = demoScrapePendingItem(3)
    demoScrapePendingItem.forget(3)

    const second = demoScrapePendingItem(3)
    expect(second).not.toBe(first)
    expect(second.key).toBe(first.key)
  })

  it('hands out copies, so changing one does not change the default', async () => {
    await userPresetsItem.removeValue()
    ;(await getPresets()).push(preset('leaked'))
    ;(await getSystemPresetStatus()).leaked = false
    ;(await getRecentMainSelectors()).push('//leaked')

    expect(await getPresets()).toEqual([])
    expect(await getSystemPresetStatus()).toEqual({})
    expect(await getRecentMainSelectors()).toEqual([])
  })
})
