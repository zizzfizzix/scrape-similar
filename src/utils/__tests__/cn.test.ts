import { cn } from '@/utils/cn'
import { describe, expect, it } from 'vitest'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('drops falsy values', () => {
    expect(cn('px-2', false, null, undefined, '')).toBe('px-2')
  })

  it('applies conditional object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })

  it('flattens arrays', () => {
    expect(cn(['px-2', ['py-1']])).toBe('px-2 py-1')
  })

  it('lets a later Tailwind class win over an earlier conflicting one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('keeps non-conflicting Tailwind classes side by side', () => {
    expect(cn('text-sm text-red-500', 'font-bold')).toBe('text-sm text-red-500 font-bold')
  })

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('')
  })
})
