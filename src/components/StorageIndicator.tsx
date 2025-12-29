import { formatStorageUsage } from '@/utils/batch-operations'
import type { StorageUsage } from '@/utils/types'
import { HardDrive } from 'lucide-react'
import React from 'react'

interface StorageIndicatorProps {
  storageUsage: StorageUsage
  showPercent?: boolean
}

/**
 * Displays storage usage with an icon
 */
export const StorageIndicator: React.FC<StorageIndicatorProps> = ({
  storageUsage,
  showPercent = false,
}) => {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <HardDrive className="h-4 w-4" />
      <span>{formatStorageUsage(storageUsage, showPercent)}</span>
    </div>
  )
}
