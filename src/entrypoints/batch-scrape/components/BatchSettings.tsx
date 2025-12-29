import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_BATCH_SETTINGS, type BatchSettings } from '@/utils/batch-scrape-db'
import { HelpCircle, RotateCcw } from 'lucide-react'
import React from 'react'

interface BatchSettingsFormProps {
  settings: BatchSettings
  onChange: (settings: BatchSettings) => void
  disabled?: boolean
  showResetButton?: boolean
}

/**
 * Core batch settings form controls without any wrapper.
 * Can be used in dialogs, cards, or other containers.
 */
export const BatchSettingsForm: React.FC<BatchSettingsFormProps> = ({
  settings,
  onChange,
  disabled,
  showResetButton = false,
}) => {
  const handleReset = () => {
    onChange(DEFAULT_BATCH_SETTINGS)
  }

  return (
    <div className="space-y-4">
      {showResetButton && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={disabled}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {/* Max Concurrency */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="max-concurrency">Concurrent Tabs</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Number of URLs to scrape simultaneously. Higher values are faster but use more
                  memory.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="max-concurrency"
            type="number"
            min="1"
            max="10"
            value={settings.maxConcurrency}
            onChange={(e) =>
              onChange({
                ...settings,
                maxConcurrency: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
              })
            }
            disabled={disabled}
          />
        </div>

        {/* Delay Between Requests */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="delay">Delay (ms)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Delay between starting each new scrape. Helps avoid rate limiting.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="delay"
            type="number"
            min="0"
            max="10000"
            step="100"
            value={settings.delayBetweenRequests}
            onChange={(e) =>
              onChange({
                ...settings,
                delayBetweenRequests: Math.max(0, parseInt(e.target.value) || 0),
              })
            }
            disabled={disabled}
          />
        </div>

        {/* Max Retries */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="max-retries">Max Retries</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Number of times to retry a failed URL with exponential backoff.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="max-retries"
            type="number"
            min="0"
            max="10"
            value={settings.maxRetries}
            onChange={(e) =>
              onChange({
                ...settings,
                maxRetries: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)),
              })
            }
            disabled={disabled}
          />
        </div>
      </div>

      {/* Disable JS Rendering */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="disable-js">Disable JavaScript</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Speed up scraping by disabling JavaScript rendering. Only works for static
                  content.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">Faster but only for static pages</p>
        </div>
        <Switch
          id="disable-js"
          checked={settings.disableJsRendering}
          onCheckedChange={(checked) => onChange({ ...settings, disableJsRendering: checked })}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

interface BatchSettingsComponentProps {
  settings: BatchSettings
  onChange: (settings: BatchSettings) => void
  disabled?: boolean
}

/**
 * Batch settings wrapped in a Card with header and reset button.
 * Used in the new batch page.
 */
export const BatchSettingsComponent: React.FC<BatchSettingsComponentProps> = ({
  settings,
  onChange,
  disabled,
}) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Batch Settings</CardTitle>
            <CardDescription>Configure how URLs are scraped</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <BatchSettingsForm
          settings={settings}
          onChange={onChange}
          disabled={disabled}
          showResetButton={true}
        />
      </CardContent>
    </Card>
  )
}
