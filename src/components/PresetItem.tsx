import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, EyeOff, Trash2 } from 'lucide-react'
import React from 'react'

// Ellipsize text helper
const ellipsize = (text: string, maxLength: number = 100) => {
  return text.length > maxLength ? text.substring(0, maxLength) + '…' : text
}

// Reusable PresetItem component for both dropdowns
interface PresetItemProps {
  preset: Preset
  onSelect: (preset: Preset) => void
  onDelete: (preset: Preset) => void
  isSelected?: boolean
  showXPath?: boolean
  className?: string
  'data-index'?: number
}

const PresetItem: React.FC<PresetItemProps> = ({
  preset,
  onSelect,
  onDelete,
  isSelected = false,
  showXPath = true,
  className = '',
  'data-index': dataIndex,
}) => {
  return (
    <div
      className={`flex flex-col px-3 py-2 cursor-pointer rounded-sm transition-colors ${className}`}
      onClick={() => onSelect(preset)}
      {...(dataIndex !== undefined && { 'data-autosuggest-index': dataIndex })}
    >
      <div className="flex items-center justify-between">
        <span className={`font-medium ${isSystemPreset(preset) ? '' : 'ph_hidden'}`}>
          {preset.name}
        </span>
        <div className="flex items-center gap-1">
          {isSystemPreset(preset) && (
            <Badge variant="secondary" className="text-xs">
              System
            </Badge>
          )}
          {isSelected && <Check className="h-4 w-4" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0 rounded hover:bg-destructive/10 text-destructive opacity-70 hover:opacity-100 focus:outline-none"
                aria-label={`${isSystemPreset(preset) ? 'Hide' : 'Delete'} preset "${preset.name}"`}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(preset)
                }}
              >
                {isSystemPreset(preset) ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isSystemPreset(preset) ? 'Hide' : 'Delete'} preset{' '}
              <span className={`font-semibold ${isSystemPreset(preset) ? '' : 'ph_hidden'}`}>
                "{preset.name}"
              </span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {showXPath && (
        <span
          className={`text-xs text-muted-foreground mt-1 font-mono ${isSystemPreset(preset) ? '' : 'ph_hidden'}`}
        >
          {ellipsize(preset.config.mainSelector)}
        </span>
      )}
    </div>
  )
}

export default PresetItem
