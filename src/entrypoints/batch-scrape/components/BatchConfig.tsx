import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, X } from 'lucide-react'
import React from 'react'

interface BatchConfigProps {
  config: ScrapeConfig
  onChange: (config: ScrapeConfig) => void
  disabled?: boolean
}

export const BatchConfig: React.FC<BatchConfigProps> = ({ config, onChange, disabled }) => {
  const handleMainSelectorChange = (value: string) => {
    onChange({ ...config, mainSelector: value })
  }

  const handleColumnChange = (index: number, field: 'name' | 'selector', value: string) => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], [field]: value }
    onChange({ ...config, columns: newColumns })
  }

  const handleAddColumn = () => {
    onChange({
      ...config,
      columns: [...config.columns, { name: `Column ${config.columns.length + 1}`, selector: '.' }],
    })
  }

  const handleRemoveColumn = (index: number) => {
    if (config.columns.length <= 1) return
    const newColumns = config.columns.filter((_, i) => i !== index)
    onChange({ ...config, columns: newColumns })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scrape Configuration</CardTitle>
        <CardDescription>Define what to extract from each URL</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Selector */}
        <div className="space-y-2">
          <Label htmlFor="main-selector">Main Selector</Label>
          <Textarea
            id="main-selector"
            placeholder="//table[@class='wikitable']//tr"
            value={config.mainSelector}
            onChange={(e) => handleMainSelectorChange(e.target.value)}
            disabled={disabled}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            XPath or CSS selector for repeated elements
          </p>
        </div>

        {/* Columns */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Columns</Label>
            <Button variant="outline" size="sm" onClick={handleAddColumn} disabled={disabled}>
              <Plus className="h-4 w-4 mr-2" />
              Add Column
            </Button>
          </div>

          <div className="space-y-2">
            {config.columns.map((column, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Column Name"
                    value={column.name}
                    onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Selector"
                    value={column.selector}
                    onChange={(e) => handleColumnChange(index, 'selector', e.target.value)}
                    disabled={disabled}
                    className="font-mono text-sm"
                  />
                </div>
                {config.columns.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveColumn(index)}
                    disabled={disabled}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
