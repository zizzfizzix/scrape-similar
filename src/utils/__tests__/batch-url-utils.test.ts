import { describe, expect, it } from 'vitest'
import { calculateRetryDelay, validateAndDeduplicateUrls } from '../batch-url-utils'

describe('batch-url-utils', () => {
  describe('validateAndDeduplicateUrls', () => {
    it('should validate and deduplicate URLs', () => {
      const input = `
        https://example.com/page1
        https://example.com/page2
        https://example.com/page1
        invalid-url
        chrome://extensions
      `

      const result = validateAndDeduplicateUrls(input)

      expect(result.valid).toEqual(['https://example.com/page1', 'https://example.com/page2'])
      expect(result.invalid).toContain('invalid-url')
      expect(result.invalid).toContain('chrome://extensions')
      expect(result.duplicatesRemoved).toBe(1)
    })

    it('should handle empty input', () => {
      const result = validateAndDeduplicateUrls('')
      expect(result.valid).toEqual([])
      expect(result.invalid).toEqual([])
      expect(result.duplicatesRemoved).toBe(0)
    })

    it('should remove duplicates case-insensitively', () => {
      const input = `
        https://example.com/Page1
        https://example.com/page1
      `

      const result = validateAndDeduplicateUrls(input)
      expect(result.valid.length).toBe(1)
      expect(result.duplicatesRemoved).toBe(1)
    })
  })

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const baseDelay = 1000

      const delay0 = calculateRetryDelay(0, baseDelay)
      expect(delay0).toBeGreaterThanOrEqual(1000)
      expect(delay0).toBeLessThan(2000)

      const delay1 = calculateRetryDelay(1, baseDelay)
      expect(delay1).toBeGreaterThanOrEqual(2000)
      expect(delay1).toBeLessThan(3000)

      const delay2 = calculateRetryDelay(2, baseDelay)
      expect(delay2).toBeGreaterThanOrEqual(4000)
      expect(delay2).toBeLessThan(5000)
    })
  })
})
