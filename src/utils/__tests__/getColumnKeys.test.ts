import { getColumnKeys } from '@/utils/getColumnKeys'
import type { ColumnDefinition } from '@/utils/types'
import { describe, expect, it } from 'vitest'

describe('getColumnKeys', () => {
  it('maps by index so duplicate display names keep distinct keys', () => {
    const columns: ColumnDefinition[] = [
      { name: 'Value', selector: '.', key: 'value_1' },
      { name: 'Value', selector: '@title', key: 'value_2' },
    ]

    expect(getColumnKeys(['Value', 'Value'], columns)).toEqual(['value_1', 'value_2'])
  })

  it('falls back to the display name when a column has no key', () => {
    const columns: ColumnDefinition[] = [{ name: 'Text', selector: '.' }]

    expect(getColumnKeys(['Text'], columns)).toEqual(['Text'])
  })

  it('falls back to the display name when there is no column at that index', () => {
    const columns: ColumnDefinition[] = [{ name: 'Text', selector: '.', key: 'text_1' }]

    expect(getColumnKeys(['Text', 'Extra'], columns)).toEqual(['text_1', 'Extra'])
  })
})
