import { describe, expect, it } from 'vitest'

import { isSystemPreset } from '@/utils/isSystemPreset'
import { SYSTEM_PRESETS } from '@/utils/system_presets'
import type { Preset } from '@/utils/types'

describe('isSystemPreset', () => {
  it('returns true for system presets', () => {
    // Test with each system preset
    SYSTEM_PRESETS.forEach((systemPreset) => {
      expect(isSystemPreset(systemPreset)).toBe(true)
    })
  })

  it('returns true for preset with matching system preset ID', () => {
    const customPreset: Preset = {
      id: 'sys-nofollow-links', // Same ID as a system preset
      name: 'Custom Nofollow Links',
      config: {
        mainSelector: '//custom',
        columns: [{ name: 'Custom', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(customPreset)).toBe(true)
  })

  it('returns false for user-created presets', () => {
    const userPreset: Preset = {
      id: 'user-custom-preset',
      name: 'My Custom Preset',
      config: {
        mainSelector: '//div[@class="custom"]',
        columns: [
          { name: 'Title', selector: './/h2' },
          { name: 'Description', selector: './/p' },
        ],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(userPreset)).toBe(false)
  })

  it('returns false for preset with empty ID', () => {
    const emptyIdPreset: Preset = {
      id: '',
      name: 'Empty ID Preset',
      config: {
        mainSelector: '//div',
        columns: [{ name: 'Content', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(emptyIdPreset)).toBe(false)
  })

  it('returns false for preset with undefined-like ID', () => {
    const undefinedIdPreset: Preset = {
      id: 'undefined',
      name: 'Undefined ID Preset',
      config: {
        mainSelector: '//div',
        columns: [{ name: 'Content', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(undefinedIdPreset)).toBe(false)
  })

  it('handles case sensitivity correctly', () => {
    const uppercaseIdPreset: Preset = {
      id: 'SYS-NOFOLLOW-LINKS', // Uppercase version of system preset ID
      name: 'Uppercase ID Preset',
      config: {
        mainSelector: '//div',
        columns: [{ name: 'Content', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(uppercaseIdPreset)).toBe(false)
  })

  it('handles partial ID matches correctly', () => {
    const partialIdPreset: Preset = {
      id: 'sys-nofollow', // Partial match of 'sys-nofollow-links'
      name: 'Partial ID Preset',
      config: {
        mainSelector: '//div',
        columns: [{ name: 'Content', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(partialIdPreset)).toBe(false)
  })

  it('verifies all expected system preset IDs are covered', () => {
    const expectedSystemPresetIds = [
      'sys-nofollow-links',
      'sys-sponsored-links',
      'sys-ugc-links',
      'sys-dofollow-links',
      'sys-headings',
      'sys-images',
      'sys-external-links',
      'sys-internal-links',
      'sys-social-media-links',
      'sys-forms',
      'sys-buttons-cta',
    ]

    expectedSystemPresetIds.forEach((id) => {
      const mockPreset: Preset = {
        id,
        name: 'Test Preset',
        config: { mainSelector: '//div', columns: [] },
        createdAt: 0,
      }
      expect(isSystemPreset(mockPreset)).toBe(true)
    })

    // Ensure we have the expected number of system presets
    expect(SYSTEM_PRESETS).toHaveLength(expectedSystemPresetIds.length)
  })

  it('handles special characters in ID correctly', () => {
    const specialCharPreset: Preset = {
      id: 'sys-nofollow-links!@#',
      name: 'Special Char Preset',
      config: {
        mainSelector: '//div',
        columns: [{ name: 'Content', selector: '.' }],
      },
      createdAt: Date.now(),
    }

    expect(isSystemPreset(specialCharPreset)).toBe(false)
  })
})
