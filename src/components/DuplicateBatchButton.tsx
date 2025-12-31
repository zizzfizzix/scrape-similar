import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BatchScrapeJob } from '@/utils/batch-scrape-db'
import { getDuplicateBatchUrl } from '@/utils/batch-urls'
import type { ButtonSize } from '@/utils/types'
import { Copy } from 'lucide-react'
import React from 'react'

interface DuplicateBatchButtonProps {
  batch: BatchScrapeJob
  /** Whether to stop click propagation (useful in clickable cards) */
  stopPropagation?: boolean
  /** Button size variant */
  size?: ButtonSize
}

export const DuplicateBatchButton: React.FC<DuplicateBatchButtonProps> = ({
  batch,
  stopPropagation = false,
  size = 'icon',
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          asChild
          onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
          <a href={getDuplicateBatchUrl(batch.id)}>
            <Copy className="h-4 w-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Duplicate batch</TooltipContent>
    </Tooltip>
  )
}
