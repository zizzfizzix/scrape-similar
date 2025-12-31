/**
 * Utility functions for parsing hash-based routes in URLs
 *
 * Note: For route components, use TanStack Router's built-in hooks instead:
 * - useParams() for path parameters (e.g., $id, $tabId)
 * - useSearch() for query parameters (e.g., ?from=123&tab=456)
 *
 * These utilities are only needed when parsing URLs outside the router context
 * (e.g., in the SidePanel when handling external URL strings).
 */

/**
 * Extract tab ID from a hash-based data view URL
 *
 * Used in SidePanel to parse tab ID from URL strings when handling
 * the "Compact View" button outside the router context.
 *
 * @param url - Full URL string (e.g., "chrome-extension://xxx/app.html#/data/123")
 * @returns Tab ID as a string, or null if not found
 * @example
 * extractTabIdFromDataUrl("chrome-extension://xxx/app.html#/data/123") // "123"
 * extractTabIdFromDataUrl("chrome-extension://xxx/app.html#/data/") // null
 */
export const extractTabIdFromDataUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url)
    const hashPath = urlObj.hash // e.g., "#/data/123"
    const match = hashPath.match(/#\/data\/(\d+)/)
    return match?.[1] ?? null
  } catch (error) {
    return null
  }
}
