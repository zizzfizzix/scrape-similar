// @vitest-environment jsdom
import { RowActionsCell } from '@/components/RowActionsCell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ANALYTICS_EVENTS } from '@/utils/analytics'
import type { ScrapedRow } from '@/utils/types'
import { act, render as renderComponent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/utils/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/analytics')>()),
  trackEvent,
}))

const toastMocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('sonner', () => toastMocks)

const filledRow: ScrapedRow = {
  data: { country: 'Poland', rank: '1' },
  metadata: { originalIndex: 4, isEmpty: false },
}
const emptyRow: ScrapedRow = {
  data: { rank: '', country: '' },
  metadata: { originalIndex: 5, isEmpty: true },
}

const render = (row: ScrapedRow, onHighlight = vi.fn()) =>
  renderComponent(
    <TooltipProvider>
      <RowActionsCell
        row={row}
        mainSelector="//tr"
        columnKeys={['rank', 'country']}
        exportType="data_table_row"
        onHighlight={onHighlight}
      />
    </TooltipProvider>,
  )

const clickCopy = () =>
  act(async () => {
    screen.getByRole('button', { name: 'Copy this row' }).click()
    await Promise.resolve()
  })

beforeEach(() => {
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RowActionsCell', () => {
  it('highlights the row by its one-based original position', async () => {
    const onHighlight = vi.fn()
    render(filledRow, onHighlight)

    await userEvent.click(screen.getByRole('button', { name: 'Highlight this element' }))

    expect(onHighlight).toHaveBeenCalledWith('(//tr)[5]')
  })

  it('copies the row as TSV in column-key order', async () => {
    render(filledRow)

    await clickCopy()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1\tPoland')
    expect(toastMocks.toast.success).toHaveBeenCalledWith('Copied row to clipboard')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
      rows_copied: 1,
      columns_count: 2,
      export_type: 'data_table_row',
    })
  })

  it('reports a clipboard the browser refused', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
    render(filledRow)

    await clickCopy()

    expect(toastMocks.toast.success).not.toHaveBeenCalled()
    expect(toastMocks.toast.error).toHaveBeenCalledWith('Failed to copy')
    expect(trackEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
  })

  it.each(['Highlight this element', 'Copy this row'])('names %s in a tooltip', async (label) => {
    render(filledRow)

    await userEvent.hover(screen.getByRole('button', { name: label }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(label)
  })

  it('disables both controls of an empty row and leaves them unlabelled', () => {
    render(emptyRow)

    const controls = screen.getAllByRole('button')
    expect(controls).toHaveLength(2)
    for (const control of controls) {
      expect(control).toBeDisabled()
      expect(control).not.toHaveAttribute('aria-label')
      expect(control).not.toHaveAttribute('data-state')
    }
  })
})
