import {
  buildSlideNavigationProperties,
  buildSlideViewProperties,
  demoPageUrl,
  detectPlatform,
  nextSlideIndex,
  type SlideSummary,
} from '@/entrypoints/onboarding/navigation'
import { describe, expect, it } from 'vitest'

const slide = (id: number, title: string): SlideSummary => ({
  id,
  title,
  description: `${title} description`,
})

describe('detectPlatform', () => {
  it('recognises an Intel Mac', () => {
    expect(detectPlatform('MacIntel')).toBe('mac')
  })

  it('recognises an Apple Silicon Mac', () => {
    expect(detectPlatform('MacARM')).toBe('mac')
  })

  it('matches regardless of case', () => {
    expect(detectPlatform('macintel')).toBe('mac')
  })

  it('treats Windows as the non-Mac case', () => {
    expect(detectPlatform('Win32')).toBe('win')
  })

  it('treats Linux as the non-Mac case', () => {
    expect(detectPlatform('Linux x86_64')).toBe('win')
  })

  it('treats an unreported platform as the non-Mac case', () => {
    expect(detectPlatform('')).toBe('win')
  })
})

describe('nextSlideIndex', () => {
  it('moves forward one slide', () => {
    expect(nextSlideIndex(0, 3, 1)).toBe(1)
  })

  it('moves back one slide', () => {
    expect(nextSlideIndex(2, 3, -1)).toBe(1)
  })

  it('stops at the last slide', () => {
    expect(nextSlideIndex(2, 3, 1)).toBeNull()
  })

  it('stops at the first slide', () => {
    expect(nextSlideIndex(0, 3, -1)).toBeNull()
  })

  it('reports nothing for a deck with a single slide', () => {
    expect(nextSlideIndex(0, 1, 1)).toBeNull()
    expect(nextSlideIndex(0, 1, -1)).toBeNull()
  })

  it('reports nothing for an empty deck', () => {
    expect(nextSlideIndex(0, 0, 1)).toBeNull()
  })

  it('reports nothing when the current index is past the end', () => {
    expect(nextSlideIndex(9, 3, -1)).toBeNull()
  })

  it('reports nothing when the current index is negative', () => {
    expect(nextSlideIndex(-1, 3, 1)).toBeNull()
  })
})

describe('buildSlideViewProperties', () => {
  const slides = [slide(1, 'Welcome'), slide(2, 'Picker'), slide(3, 'Export')]

  it('numbers the slide from one, for readability in reports', () => {
    expect(buildSlideViewProperties(0, slides[0]!, 3)).toMatchObject({
      slide_number: 1,
      slide_id: 1,
      slide_title: 'Welcome',
      slide_description: 'Welcome description',
      total_slides: 3,
    })
  })

  it('marks the first slide', () => {
    const properties = buildSlideViewProperties(0, slides[0]!, 3)

    expect(properties.is_first_slide).toBe(true)
    expect(properties.is_last_slide).toBe(false)
  })

  it('marks the last slide', () => {
    const properties = buildSlideViewProperties(2, slides[2]!, 3)

    expect(properties.is_first_slide).toBe(false)
    expect(properties.is_last_slide).toBe(true)
  })

  it('marks a middle slide as neither', () => {
    const properties = buildSlideViewProperties(1, slides[1]!, 3)

    expect(properties.is_first_slide).toBe(false)
    expect(properties.is_last_slide).toBe(false)
  })

  it('marks the only slide of a one-slide deck as both', () => {
    const properties = buildSlideViewProperties(0, slides[0]!, 1)

    expect(properties.is_first_slide).toBe(true)
    expect(properties.is_last_slide).toBe(true)
  })
})

describe('buildSlideNavigationProperties', () => {
  it('describes both ends of a forward move', () => {
    expect(buildSlideNavigationProperties(0, slide(1, 'Welcome'), 1, slide(2, 'Picker'))).toEqual({
      from_slide: { index: 1, title: 'Welcome' },
      to_slide: { index: 2, title: 'Picker' },
    })
  })

  it('describes both ends of a backward move', () => {
    expect(buildSlideNavigationProperties(2, slide(3, 'Export'), 1, slide(2, 'Picker'))).toEqual({
      from_slide: { index: 3, title: 'Export' },
      to_slide: { index: 2, title: 'Picker' },
    })
  })
})

describe('demoPageUrl', () => {
  it('uses a fixed article in test builds so assertions have something stable', () => {
    expect(demoPageUrl(true)).toBe(
      'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    )
  })

  it('uses a random article otherwise', () => {
    expect(demoPageUrl(false)).toBe('https://en.wikipedia.org/wiki/Special:Random')
  })
})
