import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { BatchScrapeJob } from '@/utils/scrape-db'
import { navigateToDuplicate } from '@/utils/scrape-operations'
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
  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
    navigateToDuplicate(batch)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size={size} onClick={handleClick}>
          <Copy className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Duplicate batch</TooltipContent>
    </Tooltip>
  )
}
