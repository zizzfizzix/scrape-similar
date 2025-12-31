import { describe, expect, it } from 'vitest'

import { extractTabIdFromDataUrl } from '@/utils/hash-url-parser'

describe('hash-url-parser utilities', () => {
  describe('extractTabIdFromDataUrl', () => {
    it('extracts numeric tab ID from valid data view URLs', () => {
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/123')).toBe('123')
      expect(extractTabIdFromDataUrl('chrome-extension://abc123/app.html#/data/456')).toBe('456')
      expect(extractTabIdFromDataUrl('chrome-extension://test/app.html#/data/1')).toBe('1')
      expect(extractTabIdFromDataUrl('chrome-extension://test/app.html#/data/999999')).toBe(
        '999999',
      )
    })

    it('returns null for non-data-view routes', () => {
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/scrapes')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/scrapes/new')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/scrapes/abc-123')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/onboarding')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html')).toBeNull()
    })

    it('returns null for data route without numeric ID', () => {
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data')).toBeNull()
    })

    it('returns null for data route with non-numeric ID', () => {
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/abc')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/abc-123')).toBeNull()
    })

    it('extracts digits from mixed alphanumeric IDs (lenient behavior)', () => {
      // The regex /#\/data\/(\d+)/ will match and extract leading digits
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/123abc')).toBe('123')
    })

    it('returns null for invalid/malformed URLs', () => {
      expect(extractTabIdFromDataUrl('not-a-url')).toBeNull()
      expect(extractTabIdFromDataUrl('')).toBeNull()
      expect(extractTabIdFromDataUrl('//invalid')).toBeNull()
      expect(extractTabIdFromDataUrl('chrome-extension://')).toBeNull()
    })

    it('handles URLs with query parameters', () => {
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/123?param=value')).toBe(
        '123',
      )
      expect(
        extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/456?foo=bar&baz=qux'),
      ).toBe('456')
    })

    it('handles different protocol schemes', () => {
      expect(extractTabIdFromDataUrl('https://example.com/app.html#/data/123')).toBe('123')
      expect(extractTabIdFromDataUrl('http://localhost:3000/app.html#/data/789')).toBe('789')
      expect(extractTabIdFromDataUrl('file:///path/to/app.html#/data/456')).toBe('456')
    })

    it('handles edge cases', () => {
      // Leading zeros
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/0123')).toBe('0123')
      // Zero
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/0')).toBe('0')
      // Multiple hash symbols (only the first hash is part of the hash property)
      expect(extractTabIdFromDataUrl('chrome-extension://xxx/app.html#/data/123#extra')).toBe('123')
    })
  })
})
