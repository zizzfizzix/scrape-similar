import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { parseUrlsFromFile, validateAndDeduplicateUrls } from '@/utils/batch-url-utils'
import { AlertCircle, FileUp, X } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface BatchUrlInputProps {
  urls: string
  onChange: (urls: string) => void
  disabled?: boolean
}

export const BatchUrlInput: React.FC<BatchUrlInputProps> = ({ urls, onChange, disabled }) => {
  const [validationResult, setValidationResult] = useState<{
    valid: number
    invalid: number
    duplicates: number
  } | null>(null)

  // Validate URLs on change
  const handleChange = useCallback(
    (value: string) => {
      onChange(value)

      if (value.trim().length === 0) {
        setValidationResult(null)
        return
      }

      const result = validateAndDeduplicateUrls(value)
      setValidationResult({
        valid: result.valid.length,
        invalid: result.invalid.length,
        duplicates: result.duplicatesRemoved,
      })
    },
    [onChange],
  )

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const content = await parseUrlsFromFile(file)
        handleChange(content)
        toast.success(`Loaded ${file.name}`)
      } catch (error) {
        toast.error('Failed to read file')
      }

      // Reset file input
      event.target.value = ''
    },
    [handleChange],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>URLs to Scrape</CardTitle>
        <CardDescription>Enter one URL per line, or upload a TXT/CSV file</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="urls-input">URLs</Label>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" asChild disabled={disabled}>
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <FileUp className="h-4 w-4 mr-2" />
                        Upload File
                        <input
                          id="file-upload"
                          type="file"
                          accept=".txt,.csv"
                          onChange={handleFileUpload}
                          className="hidden"
                          disabled={disabled}
                        />
                      </label>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload a TXT or CSV file with URLs</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {urls && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleChange('')}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <Textarea
            id="urls-input"
            placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
            value={urls}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            className="font-mono text-sm min-h-[200px]"
          />
        </div>

        {/* Validation results */}
        {validationResult && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-medium text-green-600 dark:text-green-400">
                {validationResult.valid}
              </span>
              <span className="text-muted-foreground">valid</span>
            </div>
            {validationResult.invalid > 0 && (
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">{validationResult.invalid}</span>
                <span>invalid</span>
              </div>
            )}
            {validationResult.duplicates > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <span className="font-medium">{validationResult.duplicates}</span>
                <span>duplicates removed</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
