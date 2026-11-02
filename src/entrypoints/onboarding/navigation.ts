/**
 * Slide navigation and the analytics that goes with it.
 *
 * Split out of `OnboardingApp.tsx`, where the same index-bounds reasoning was
 * repeated for each direction and inlined with the event payloads.
 */

/** Just enough of a slide to identify it in an analytics event. */
export interface SlideSummary {
  id: number
  title: string
  description: string
}

export type Platform = 'mac' | 'win'

/**
 * Which modifier key labels to show.
 *
 * Everything that is not a Mac gets the Windows labels, which also match Linux.
 */
export const detectPlatform = (navigatorPlatform: string): Platform =>
  navigatorPlatform.toUpperCase().includes('MAC') ? 'mac' : 'win'

/**
 * The slide index a move in `direction` lands on, or null when there is none —
 * either because the deck ends there, or the current index is out of range.
 */
export const nextSlideIndex = (
  currentIndex: number,
  totalSlides: number,
  direction: 1 | -1,
): number | null => {
  if (currentIndex < 0 || currentIndex >= totalSlides) return null

  const target = currentIndex + direction
  return target >= 0 && target < totalSlides ? target : null
}

/** Properties describing a slide the user has arrived at. */
export const buildSlideViewProperties = (
  slideIndex: number,
  slide: SlideSummary,
  totalSlides: number,
) =>
  ({
    [ANALYTICS_PROPERTIES.SLIDE_NUMBER]: slideIndex + 1,
    [ANALYTICS_PROPERTIES.SLIDE_ID]: slide.id,
    [ANALYTICS_PROPERTIES.SLIDE_TITLE]: slide.title,
    [ANALYTICS_PROPERTIES.SLIDE_DESCRIPTION]: slide.description,
    [ANALYTICS_PROPERTIES.IS_FIRST_SLIDE]: slideIndex === 0,
    [ANALYTICS_PROPERTIES.IS_LAST_SLIDE]: slideIndex === totalSlides - 1,
    [ANALYTICS_PROPERTIES.TOTAL_SLIDES]: totalSlides,
  }) satisfies AnalyticsProperties

/** Properties describing a move between two slides. */
export const buildSlideNavigationProperties = (
  fromIndex: number,
  fromSlide: SlideSummary,
  toIndex: number,
  toSlide: SlideSummary,
) =>
  ({
    [ANALYTICS_PROPERTIES.FROM_SLIDE]: { index: fromIndex + 1, title: fromSlide.title },
    [ANALYTICS_PROPERTIES.TO_SLIDE]: { index: toIndex + 1, title: toSlide.title },
  }) satisfies AnalyticsProperties

/**
 * The page the demo scrape runs on.
 *
 * A random article shows the picker working on a page nobody prepared; the E2E
 * suite needs a fixed one so its assertions have something stable to match.
 */
export const demoPageUrl = (isTest: boolean): string =>
  isTest
    ? 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population'
    : 'https://en.wikipedia.org/wiki/Special:Random'
