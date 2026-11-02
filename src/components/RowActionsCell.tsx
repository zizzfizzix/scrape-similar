import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShownToast } from '@/hooks/use-shown-toast'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { reportRejection } from '@/utils/report-rejection'
import { rowToTsv } from '@/utils/tsv'
import { Clipboard, Highlighter } from 'lucide-react'
import React from 'react'

interface RowActionsCellProps {
  row: ScrapedRow
  mainSelector: string
  columnKeys: string[]
  /** `export_type` reported with the copy event; tells the two tables apart in analytics. */
  exportType: RowExportType
  onHighlight: (rowSelector: string) => void
}

export const RowActionsCell: React.FC<RowActionsCellProps> = ({
  row,
  mainSelector,
  columnKeys,
  exportType,
  onHighlight,
}) => {
  const { isEmpty, originalIndex } = row.metadata
  const notify = useShownToast()

  const highlightButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={isEmpty ? undefined : 'Highlight this element'}
      disabled={isEmpty}
      onClick={isEmpty ? undefined : () => onHighlight(`(${mainSelector})[${originalIndex + 1}]`)}
    >
      <Highlighter className="size-4" />
    </Button>
  )

  const copyRow = async () => {
    const tsvContent = rowToTsv(row, columnKeys)
    try {
      await navigator.clipboard.writeText(tsvContent)
      notify.success('Copied row to clipboard')
      trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_TRIGGER, {
        [ANALYTICS_PROPERTIES.ROWS_COPIED]: 1,
        [ANALYTICS_PROPERTIES.COLUMNS_COUNT]: columnKeys.length,
        [ANALYTICS_PROPERTIES.EXPORT_TYPE]: exportType,
      })
    } catch {
      notify.error('Failed to copy')
      trackEvent(ANALYTICS_EVENTS.COPY_TO_CLIPBOARD_FAILURE)
    }
  }

  const copyButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={isEmpty ? undefined : 'Copy this row'}
      disabled={isEmpty}
      onClick={isEmpty ? undefined : () => reportRejection(copyRow())}
    >
      <Clipboard className="size-4" />
    </Button>
  )

  if (isEmpty) {
    return (
      <div className="flex gap-1">
        {highlightButton}
        {copyButton}
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <Tooltip>
        <TooltipTrigger asChild>{highlightButton}</TooltipTrigger>
        <TooltipContent>Highlight this element</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>{copyButton}</TooltipTrigger>
        <TooltipContent>Copy this row</TooltipContent>
      </Tooltip>
    </div>
  )
}
