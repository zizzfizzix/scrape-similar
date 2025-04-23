import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SYSTEM_PRESETS } from '@/core/system_presets'
import { MESSAGE_TYPES, Preset, ScrapeConfig, SelectionOptions } from '@/core/types'
import { Check, ChevronsUpDown, Info, Plus, Trash2, Wand, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

interface ConfigFormProps {
  config: ScrapeConfig
  onChange: (config: ScrapeConfig) => void
  onScrape: () => void
  onHighlight: (selector: string) => void
  isLoading: boolean
  initialOptions: SelectionOptions | null
  presets: Preset[]
  onLoadPreset: (preset: Preset) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (presetId: string) => void
  showPresets: boolean
  setShowPresets: React.Dispatch<React.SetStateAction<boolean>>
  lastScrapeRowCount: number | null
  onClearLastScrapeRowCount?: () => void
}

const ConfigForm: React.FC<ConfigFormProps> = ({
  config,
  onChange,
  onScrape,
  onHighlight,
  isLoading,
  initialOptions,
  presets,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  showPresets,
  setShowPresets,
  lastScrapeRowCount,
  onClearLastScrapeRowCount,
}) => {
  // Local state for adding a new column
  const [newColumnName, setNewColumnName] = useState('')

  const columnsListRef = useRef<HTMLDivElement>(null)
  const prevColumnsCount = useRef(config.columns.length)
  const [shouldScrollToEnd, setShouldScrollToEnd] = useState(false)
  const [guessButtonState, setGuessButtonState] = useState<
    'idle' | 'generating' | 'success' | 'failure'
  >('idle')
  const [scrapeButtonState, setScrapeButtonState] = useState<'idle' | 'zero-found'>('idle')
  const zeroFoundTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // State for Save Preset drawer
  const [isSaveDrawerOpen, setIsSaveDrawerOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // State for Load Preset combobox
  const [isLoadPopoverOpen, setIsLoadPopoverOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  // State for delete confirmation drawer
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [presetToDelete, setPresetToDelete] = useState<Preset | null>(null)

  // Add ref for main selector input
  const mainSelectorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (shouldScrollToEnd && config.columns.length > prevColumnsCount.current) {
      if (columnsListRef.current) {
        columnsListRef.current.scrollTo({
          left: columnsListRef.current.scrollWidth,
          behavior: 'smooth',
        })
      }
      setShouldScrollToEnd(false)
    }
    prevColumnsCount.current = config.columns.length
  }, [config.columns.length, shouldScrollToEnd])

  // Watch for lastScrapeRowCount changes
  useEffect(() => {
    if (typeof lastScrapeRowCount === 'number') {
      if (lastScrapeRowCount === 0) {
        setScrapeButtonState('zero-found')
        if (zeroFoundTimeoutRef.current) clearTimeout(zeroFoundTimeoutRef.current)
        zeroFoundTimeoutRef.current = setTimeout(() => {
          setScrapeButtonState('idle')
          if (onClearLastScrapeRowCount) onClearLastScrapeRowCount()
        }, 1500)
      } else {
        setScrapeButtonState('idle')
        if (onClearLastScrapeRowCount) onClearLastScrapeRowCount()
      }
    }
    return () => {
      if (zeroFoundTimeoutRef.current) clearTimeout(zeroFoundTimeoutRef.current)
    }
  }, [lastScrapeRowCount, onClearLastScrapeRowCount])

  // Handle main selector change
  const handleMainSelectorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      mainSelector: e.target.value,
    })
  }

  // Handle column name change
  const handleColumnNameChange = (index: number, value: string) => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], name: value }
    onChange({
      ...config,
      columns: newColumns,
    })
  }

  // Handle column selector change
  const handleColumnSelectorChange = (index: number, value: string) => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], selector: value }
    onChange({
      ...config,
      columns: newColumns,
    })
  }

  // Add a new column
  const addColumn = () => {
    if (!newColumnName.trim()) return

    onChange({
      ...config,
      columns: [...config.columns, { name: newColumnName, selector: '.' }],
    })

    setNewColumnName('')
  }

  // Remove a column
  const removeColumn = (index: number) => {
    onChange({
      ...config,
      columns: config.columns.filter((_, i) => i !== index),
    })
  }

  // Handler to guess config from selector
  const handleGuessConfig = async () => {
    if (!config.mainSelector) return
    setGuessButtonState('generating')
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab?.id) {
          setGuessButtonState('failure')
          setTimeout(() => setGuessButtonState('idle'), 1500)
          return
        }
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR,
            payload: { mainSelector: config.mainSelector },
          },
          (response) => {
            if (response && response.success === true) {
              setGuessButtonState('success')
              setTimeout(() => setGuessButtonState('idle'), 1500)
            } else {
              setGuessButtonState('failure')
              setTimeout(() => setGuessButtonState('idle'), 1500)
            }
          },
        )
      })
    } catch (err) {
      setGuessButtonState('failure')
      setTimeout(() => setGuessButtonState('idle'), 1500)
    }
  }

  // Save Preset handler
  const handleSavePreset = async () => {
    if (!presetName.trim()) return
    setIsSaving(true)
    await onSavePreset(presetName.trim())
    setIsSaving(false)
    setPresetName('')
    setIsSaveDrawerOpen(false)
  }

  // Load Preset handler
  const handleSelectPreset = (preset: Preset) => {
    setSelectedPresetId(preset.id)
    onLoadPreset(preset)
    setIsLoadPopoverOpen(false)
  }

  // Delete Preset handler (with confirmation)
  const handleRequestDeletePreset = (preset: Preset) => {
    setPresetToDelete(preset)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDeletePreset = () => {
    if (presetToDelete) {
      onDeletePreset(presetToDelete.id)
    }
    setDeleteDialogOpen(false)
    setPresetToDelete(null)
  }

  const handleCancelDeletePreset = () => {
    setDeleteDialogOpen(false)
    setPresetToDelete(null)
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Configuration header row with Save/Load Preset buttons */}
      <div className="flex flex-row items-center justify-between gap-4 mb-2">
        <h2 className="scroll-m-20 text-2xl font-bold tracking-tight">Configuration</h2>
        <div className="flex flex-row gap-2 items-center">
          {/* Load Preset Combobox */}
          <Popover open={isLoadPopoverOpen} onOpenChange={setIsLoadPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" type="button" aria-expanded={isLoadPopoverOpen}>
                Load
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-72">
              <Command>
                <CommandInput
                  placeholder="Search presets..."
                  value={search}
                  onValueChange={setSearch}
                  autoFocus
                />
                <CommandList>
                  <CommandEmpty>No presets found.</CommandEmpty>
                  <CommandGroup heading="Presets">
                    {presets.length === 0 && (
                      <div className="p-2 text-sm text-muted-foreground">No presets saved.</div>
                    )}
                    {presets
                      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                      .map((preset) => {
                        const isSystemPreset = SYSTEM_PRESETS.some((sys) => sys.id === preset.id)
                        return (
                          <CommandItem
                            key={preset.id}
                            value={preset.name}
                            onSelect={() => handleSelectPreset(preset)}
                            className="flex items-center justify-between group"
                          >
                            <span className="flex items-center gap-2">
                              {preset.name}
                              {isSystemPreset && (
                                <Badge variant="secondary" className="ml-2">
                                  System
                                </Badge>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {selectedPresetId === preset.id && <Check className="ml-2 h-4 w-4" />}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-2 p-1 rounded hover:bg-destructive/10 text-destructive opacity-70 hover:opacity-100 focus:outline-none"
                                    aria-label={`Delete preset ${preset.name}`}
                                    disabled={isSaving}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRequestDeletePreset(preset)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete preset</TooltipContent>
                              </Tooltip>
                            </div>
                          </CommandItem>
                        )
                      })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {/* Delete Confirmation Drawer */}
          <Drawer open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Delete Preset</DrawerTitle>
                <DrawerDescription>
                  Are you sure you want to delete the preset
                  {presetToDelete ? (
                    <span className="font-semibold text-destructive"> "{presetToDelete.name}"</span>
                  ) : null}
                  ? This action cannot be undone.
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDeletePreset}
                  disabled={isSaving}
                  loading={isSaving}
                >
                  Delete
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost" type="button" onClick={handleCancelDeletePreset}>
                    Cancel
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
          {/* Save Preset Drawer */}
          <Drawer open={isSaveDrawerOpen} onOpenChange={setIsSaveDrawerOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="outline"
                type="button"
                disabled={isSaving || !config.mainSelector || config.columns.length === 0}
              >
                Save
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Save Preset</DrawerTitle>
                <DrawerDescription>Enter a name for your preset configuration.</DrawerDescription>
              </DrawerHeader>
              <div className="p-4">
                <Input
                  type="text"
                  placeholder="Preset name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  autoFocus
                />
              </div>
              <DrawerFooter>
                <Button
                  onClick={handleSavePreset}
                  disabled={
                    isSaving ||
                    !presetName.trim() ||
                    !config.mainSelector ||
                    config.columns.length === 0
                  }
                  loading={isSaving}
                >
                  Save
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost" type="button">
                    Cancel
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Main Selector section */}
      <div className="flex flex-col gap-4 items-start">
        <h3 className="scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">
          Main Selector
        </h3>
        <p className="text-sm text-muted-foreground">
          This selector identifies the main elements to scrape.
        </p>
        <div className="flex gap-2 w-full items-center relative">
          <Input
            type="text"
            id="mainSelector"
            value={config.mainSelector}
            onChange={handleMainSelectorChange}
            onBlur={() => {
              if (config.mainSelector) {
                onHighlight(config.mainSelector)
              }
            }}
            placeholder="Enter XPath selector"
            ref={mainSelectorInputRef}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                mainSelectorInputRef.current?.blur()
                onScrape()
              }
            }}
            className="pr-10"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  tabIndex={-1}
                  aria-label="XPath reference"
                  onClick={() =>
                    window.open(
                      'https://www.stylusstudio.com/docs/v62/d_xpath15.html',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Info className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                XPath reference
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {initialOptions?.previewData && initialOptions.previewData.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
            <h4 className="mb-2 font-medium">Selection preview:</h4>
            <ul className="ml-5 list-disc">
              {initialOptions.previewData.map((item, index) => (
                <li key={index}>
                  {item.text.substring(0, 100)}
                  {item.text.length > 100 ? '...' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Columns section */}
      <div className="flex flex-col gap-4 items-start">
        <h3 className="scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">
          Columns
        </h3>
        <p className="text-sm text-muted-foreground">
          Define what data to extract from each main element. Use "." to get the text content of the
          element itself, or "@attr" to get an attribute.
        </p>
        <div className="flex w-full justify-between">
          <div
            className="overflow-x-auto grid grid-flow-col auto-cols-min gap-4"
            ref={columnsListRef}
          >
            {config.columns.map((column, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 items-stretch mb-0 p-2 border rounded min-w-max"
              >
                <Input
                  type="text"
                  value={column.name}
                  onChange={(e) => handleColumnNameChange(index, e.target.value)}
                  placeholder="Column name"
                  className="p-2 border rounded text-sm"
                />
                <Input
                  type="text"
                  value={column.selector}
                  onChange={(e) => handleColumnSelectorChange(index, e.target.value)}
                  placeholder="Selector"
                  className="p-2 border rounded text-sm"
                />
                <div className="flex gap-1 justify-around">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="bg-transparent border-none cursor-pointer p-1 rounded"
                        onClick={() => removeColumn(index)}
                        disabled={config.columns.length <= 1}
                        aria-label="Remove column"
                      >
                        <X />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove column</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-between ml-3 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleGuessConfig}
                  loading={guessButtonState === 'generating'}
                  disabled={guessButtonState === 'generating' || !config.mainSelector}
                  aria-label="Auto-generate configuration from selector"
                >
                  {guessButtonState === 'success' ? (
                    <Check />
                  ) : guessButtonState === 'failure' ? (
                    <X />
                  ) : (
                    <Wand />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-generate configuration from selector</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    const defaultName = `Column ${config.columns.length + 1}`
                    onChange({
                      ...config,
                      columns: [...config.columns, { name: defaultName, selector: '.' }],
                    })
                    setShouldScrollToEnd(true)
                  }}
                  aria-label="Add column"
                >
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add column</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* Centered Scrape Button, visually closer to columns */}
        <div className="flex w-full justify-center mt-4 -mb-2">
          <Button
            className="w-full max-w-2xl"
            onClick={onScrape}
            loading={isLoading}
            disabled={isLoading || !config.mainSelector || config.columns.length === 0}
          >
            {scrapeButtonState === 'zero-found' ? '0 found' : 'Scrape'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfigForm
