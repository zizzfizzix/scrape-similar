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
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import log from 'loglevel'

import {
  Check,
  ChevronsUpDown,
  ClockFading,
  Crosshair,
  HelpCircle,
  Info,
  Layers,
  LocateOff,
  OctagonAlert,
  Play,
  Plus,
  RefreshCcw,
  SquareCheckBig,
  Wand,
  X,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface ConfigFormProps {
  config: ScrapeConfig
  onChange: (config: ScrapeConfig) => void
  onScrape: () => void
  onHighlight: (selector: string) => void
  onPickerMode: () => void
  isLoading: boolean
  initialOptions: SelectionOptions | null
  presets: Preset[]
  onLoadPreset: (preset: Preset) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (preset: Preset) => void
  showPresets: boolean
  setShowPresets: React.Dispatch<React.SetStateAction<boolean>>
  lastScrapeRowCount: number | null
  onClearLastScrapeRowCount?: () => void
  highlightMatchCount?: number
  highlightError?: string
  rescrapeAdvised?: boolean
  pickerModeActive?: boolean
}

const ConfigForm: React.FC<ConfigFormProps> = ({
  config,
  onChange,
  onScrape,
  onHighlight,
  onPickerMode,
  isLoading,
  presets,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  lastScrapeRowCount,
  onClearLastScrapeRowCount,
  highlightMatchCount,
  highlightError,
  rescrapeAdvised = false,
  pickerModeActive = false,
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

  // State for main selector autosuggest (using Command component)
  const [isAutosuggestOpen, setIsAutosuggestOpen] = useState(false)
  const autosuggestRef = useRef<HTMLDivElement | null>(null)
  const commandRef = useRef<HTMLDivElement | null>(null)
  const autosuggestContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedAutosuggestIndex, setSelectedAutosuggestIndex] = useState<number>(-1)
  const [cmdkSelectedId, setCmdkSelectedId] = useState<string | undefined>(undefined)

  // Add ref for main selector input
  const mainSelectorInputRef = useRef<HTMLTextAreaElement>(null)

  // Track if we're in the process of selecting from autosuggest to prevent blur from committing stale value
  const isSelectingFromAutosuggestRef = useRef(false)

  // Keep latest config in a ref to avoid stale closures in delayed commits (e.g., blur timeout)
  const latestConfigRef = useRef(config)
  useEffect(() => {
    latestConfigRef.current = config
  }, [config])

  /**
   * Local draft state for the main selector input. We keep the user’s typing
   * here and only propagate it to the parent (handleConfigChange) when the
   * input loses focus or the user presses Enter. This prevents a flurry of
   * UPDATE_SIDEPANEL_DATA messages for every keystroke.
   */
  const [mainSelectorDraft, setMainSelectorDraft] = useState(config.mainSelector)

  // Keep draft in sync with external changes (e.g. preset load, storage sync)
  useEffect(() => {
    setMainSelectorDraft(config.mainSelector)
    setIsAutosuggestOpen(false)
  }, [config.mainSelector])

  // Add ref and state for dynamic end adornment width
  const [endAdornmentWidth, setEndAdornmentWidth] = useState(0)
  const endAdornmentRef = useRef<HTMLDivElement>(null)
  // Add ref and state for dynamic begin adornment width (left side inside input)
  const [beginAdornmentWidth, setBeginAdornmentWidth] = useState(0)
  const beginAdornmentRef = useRef<HTMLDivElement>(null)

  // Derived flags
  const hasUncommittedChanges = mainSelectorDraft !== config.mainSelector

  // Show highlight/error badges only when selector is committed
  const isMainSelectorValid =
    !hasUncommittedChanges && typeof highlightMatchCount === 'number' && !highlightError

  // Debug logging for validation state changes
  useEffect(() => {
    log.debug('ConfigForm validation state changed:', {
      highlightMatchCount,
      highlightError,
      isMainSelectorValid,
    })
  }, [highlightMatchCount, highlightError, isMainSelectorValid])

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

  useEffect(() => {
    if (endAdornmentRef.current) {
      setEndAdornmentWidth(endAdornmentRef.current.offsetWidth)
    }
  }, [highlightError, highlightMatchCount])

  useEffect(() => {
    if (beginAdornmentRef.current) {
      setBeginAdornmentWidth(beginAdornmentRef.current.offsetWidth)
    }
  }, [])

  // Commit the draft main selector to parent state and trigger highlight
  const commitMainSelector = (value: string) => {
    const latest = latestConfigRef.current
    if (value !== latest.mainSelector) {
      onChange({ ...latest, mainSelector: value })
    }
    if (value.trim()) {
      onHighlight(value)
    }
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
    trackEvent(ANALYTICS_EVENTS.REMOVE_COLUMN_BUTTON_PRESS)

    onChange({
      ...config,
      columns: config.columns.filter((_, i) => i !== index),
    })
  }

  // Handler to guess config from selector
  const handleGuessConfig = async () => {
    const selector = (mainSelectorDraft || config.mainSelector).trim()
    if (!selector) return

    // Track auto-generate config button press
    trackEvent(ANALYTICS_EVENTS.AUTO_GENERATE_CONFIG_BUTTON_PRESS)

    setGuessButtonState('generating')
    try {
      // Ensure the committed config matches the selector we're about to use
      if (selector !== config.mainSelector) {
        commitMainSelector(selector)
      }
      browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab?.id) {
          setGuessButtonState('failure')
          setTimeout(() => setGuessButtonState('idle'), 1500)
          return
        }
        browser.tabs.sendMessage(
          tab.id,
          {
            type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR,
            payload: { mainSelector: selector },
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
    toast.success(
      <>
        Preset "<span className="ph_hidden">{presetName.trim()}</span>" saved
      </>,
    )
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
      onDeletePreset(presetToDelete)
    }
    setDeleteDialogOpen(false)
    setPresetToDelete(null)
  }

  const handleCancelDeletePreset = () => {
    setDeleteDialogOpen(false)
    setPresetToDelete(null)
  }

  // Handle autosuggest preset selection
  const handleAutosuggestSelect = (preset: Preset) => {
    // Update the draft immediately to prevent blur handler from committing stale value
    setMainSelectorDraft(preset.config.mainSelector)
    // Load the full preset (including columns) just like the Load button does
    onLoadPreset(preset)
    setIsAutosuggestOpen(false)
    mainSelectorInputRef.current?.focus()
  }

  // Handle recent selector selection
  const handleRecentSelectorSelect = (selector: string) => {
    setMainSelectorDraft(selector)
    commitMainSelector(selector)
    setIsAutosuggestOpen(false)
    mainSelectorInputRef.current?.focus()
  }

  // Handle main selector focus
  const handleMainSelectorFocus = () => {
    setIsAutosuggestOpen(true)
  }

  // Handle main selector blur with delay to allow for clicks
  const handleMainSelectorBlur = () => {
    setTimeout(() => {
      // Don't commit if we're selecting from autosuggest (mousedown was triggered)
      if (isSelectingFromAutosuggestRef.current) {
        isSelectingFromAutosuggestRef.current = false
        return
      }

      // If focus moved into the autosuggest dropdown, keep it open
      const active = document.activeElement as HTMLElement | null
      const movedIntoDropdown = !!(active && autosuggestRef.current?.contains(active))
      if (movedIntoDropdown) return

      setIsAutosuggestOpen(false)
      commitMainSelector(mainSelectorDraft)
    }, 150)
  }

  // Sanitize to single-line by replacing CR/LF with a single space
  const sanitizeToSingleLine = (value: string) => value.replace(/[\r\n]+/g, ' ')

  // Handle main selector change with autosuggest (newline-less)
  const handleMainSelectorChange = (value: string) => {
    const sanitized = sanitizeToSingleLine(value)
    setMainSelectorDraft(sanitized)
    // Keep dropdown open while typing (including when cleared) if the textarea has focus
    if (!isAutosuggestOpen) {
      setIsAutosuggestOpen(true)
    }
    // When cleared, reset selection but do not close; show all suggestions
    if (sanitized.length === 0) {
      setSelectedAutosuggestIndex(-1)
      setCmdkSelectedId(undefined)
    }
  }

  // Presets filtered by the main selector draft (acts as search term)
  const filteredPresetsForAutosuggest = React.useMemo(() => {
    const query = (mainSelectorDraft || '').toLowerCase().trim()
    if (!query) return presets
    return presets.filter((p) => {
      const name = p.name.toLowerCase()
      const xpath = (p.config.mainSelector || '').toLowerCase()
      return name.includes(query) || xpath.includes(query)
    })
  }, [presets, mainSelectorDraft])

  // Recent selectors state
  const [recentSelectors, setRecentSelectors] = useState<string[]>([])

  useEffect(() => {
    getRecentMainSelectors().then(setRecentSelectors)
  }, [])

  // Watch local storage for recents updates and refresh state
  useEffect(() => {
    const unwatch = storage.watch<string[]>(
      `local:${STORAGE_KEYS.RECENT_MAIN_SELECTORS}` as const,
      (list) => {
        setRecentSelectors(Array.isArray(list) ? list : [])
      },
    )
    return () => unwatch()
  }, [])

  const recentSuggestions = React.useMemo(() => {
    const query = (mainSelectorDraft || '').toLowerCase().trim()
    const presetSelectors = new Set(
      presets.map((p) => (p.config.mainSelector || '').trim()).filter(Boolean),
    )
    return recentSelectors
      .filter((s) => !presetSelectors.has(s))
      .filter((s) => (query ? s.toLowerCase().includes(query) : true))
  }, [recentSelectors, presets, mainSelectorDraft])

  // Combined navigation order for cmdk (recents first, then presets)
  const combinedSuggestionValues = React.useMemo(() => {
    const recents = recentSuggestions.map((_, i) => `recent-${i}`)
    const presetsVals = filteredPresetsForAutosuggest.map((p) => p.id)
    return [...recents, ...presetsVals]
  }, [recentSuggestions, filteredPresetsForAutosuggest])

  // Handle keyboard navigation from textarea while dropdown is open/closed
  const handleAutosuggestKeyDown = (e: React.KeyboardEvent) => {
    const ensureVisible = (index: number) => {
      const items = autosuggestRef.current?.querySelectorAll('[cmdk-item]')
      const el = items && items[index] ? (items[index] as HTMLElement) : null
      if (el) el.scrollIntoView({ block: 'nearest' })
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isAutosuggestOpen) {
        setIsAutosuggestOpen(true)
        // after open, focus command root so cmdk handles keys
        requestAnimationFrame(() => {
          commandRef.current?.focus()
          setSelectedAutosuggestIndex(0)
          setCmdkSelectedId(combinedSuggestionValues[0])
          ensureVisible(0)
        })
      } else if (filteredPresetsForAutosuggest.length > 0) {
        setSelectedAutosuggestIndex((prev) => {
          const total = combinedSuggestionValues.length
          if (total === 0) return -1
          const next = prev < total - 1 ? prev + 1 : 0
          setCmdkSelectedId(combinedSuggestionValues[next])
          requestAnimationFrame(() => ensureVisible(next))
          return next
        })
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isAutosuggestOpen) {
        setIsAutosuggestOpen(true)
        requestAnimationFrame(() => {
          commandRef.current?.focus()
          const last = Math.max(0, combinedSuggestionValues.length - 1)
          setSelectedAutosuggestIndex(last)
          setCmdkSelectedId(combinedSuggestionValues[last])
          ensureVisible(last)
        })
      } else if (filteredPresetsForAutosuggest.length > 0) {
        setSelectedAutosuggestIndex((prev) => {
          const total = combinedSuggestionValues.length
          if (total === 0) return -1
          const lastIdx = total - 1
          const next = prev > 0 ? prev - 1 : lastIdx
          setCmdkSelectedId(combinedSuggestionValues[next])
          requestAnimationFrame(() => ensureVisible(next))
          return next
        })
      }
      return
    }

    if (e.key === 'Enter') {
      // Always prevent newline insertion
      e.preventDefault()
      if (isAutosuggestOpen && selectedAutosuggestIndex >= 0) {
        // Check if the selected item is a recent or a preset
        const selectedId = combinedSuggestionValues[selectedAutosuggestIndex]
        if (selectedId?.startsWith('recent-')) {
          // Extract the index from the recent ID (e.g., "recent-0" -> 0)
          const recentIndex = parseInt(selectedId.split('-')[1], 10)
          const selector = recentSuggestions[recentIndex]
          if (selector) {
            handleRecentSelectorSelect(selector)
          }
        } else {
          // It's a preset ID
          const preset = filteredPresetsForAutosuggest.find((p) => p.id === selectedId)
          if (preset) handleAutosuggestSelect(preset)
        }
        return
      }
      if (mainSelectorDraft.trim()) {
        // Save to recents if not a preset, then either validate (if changed) or scrape (if unchanged and valid)
        ;(async () => {
          const all = await getAllPresets()
          const isPreset = all.some(
            (p) => (p.config.mainSelector || '').trim() === mainSelectorDraft.trim(),
          )
          if (!isPreset) {
            await pushRecentMainSelector(mainSelectorDraft)
            const updated = await getRecentMainSelectors()
            setRecentSelectors(updated)
          }
          if (hasUncommittedChanges) {
            // First Enter after changes: validate selector via highlight
            commitMainSelector(mainSelectorDraft)
            mainSelectorInputRef.current?.blur()
          } else {
            // No changes: if valid, trigger scrape; otherwise, validate again
            if (isMainSelectorValid) {
              onScrape()
            } else {
              commitMainSelector(mainSelectorDraft)
              mainSelectorInputRef.current?.blur()
            }
          }
        })()
      }
      return
    }

    if (e.key === 'Escape' && isAutosuggestOpen) {
      e.preventDefault()
      setIsAutosuggestOpen(false)
      return
    }
  }

  // When autosuggest opens, do not preselect or focus any item.
  useEffect(() => {
    if (!isAutosuggestOpen) return
    setSelectedAutosuggestIndex(-1)
    setCmdkSelectedId(undefined)
  }, [isAutosuggestOpen])

  // Close autosuggest on outside click (since focus may be inside Command)
  useEffect(() => {
    if (!isAutosuggestOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      const container = autosuggestContainerRef.current
      if (container && !container.contains(e.target as Node)) {
        setIsAutosuggestOpen(false)
        setSelectedAutosuggestIndex(-1)
        setCmdkSelectedId(undefined)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isAutosuggestOpen])

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
              <Command
                filter={(value, search) => {
                  const preset = presets.find((p) => p.id === value)
                  if (!preset) return 0
                  if (preset.name.toLowerCase().includes(search.toLowerCase())) return 1
                  return 0
                }}
              >
                <CommandInput
                  placeholder="Search presets..."
                  value={search}
                  onValueChange={setSearch}
                  autoFocus
                  className="ph_hidden"
                />
                <CommandList>
                  <CommandEmpty>No presets found</CommandEmpty>
                  <CommandGroup heading="Presets">
                    {presets.length === 0 && (
                      <div className="p-2 text-sm text-muted-foreground">No presets saved</div>
                    )}
                    {presets.map((preset) => {
                      return (
                        <CommandItem
                          key={preset.id}
                          value={preset.id}
                          onSelect={() => handleSelectPreset(preset)}
                          className="p-0"
                        >
                          <PresetItem
                            preset={preset}
                            onSelect={handleSelectPreset}
                            onDelete={handleRequestDeletePreset}
                            isSelected={selectedPresetId === preset.id}
                            className="w-full hover:bg-transparent"
                          />
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
                <DrawerTitle>
                  {presetToDelete && isSystemPreset(presetToDelete)
                    ? 'Hide Preset'
                    : 'Delete Preset'}
                </DrawerTitle>
                <DrawerDescription>
                  Are you sure you want to{' '}
                  {presetToDelete && isSystemPreset(presetToDelete) ? 'hide' : 'delete'} the preset
                  "
                  {presetToDelete ? (
                    <span
                      className={`font-semibold text-destructive ${presetToDelete && isSystemPreset(presetToDelete) ? '' : 'ph_hidden'}`}
                    >
                      {presetToDelete.name}
                    </span>
                  ) : null}
                  "?
                  {presetToDelete && isSystemPreset(presetToDelete)
                    ? ''
                    : ' This action cannot be undone.'}
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDeletePreset}
                  disabled={isSaving}
                  loading={isSaving}
                >
                  {presetToDelete && isSystemPreset(presetToDelete) ? 'Hide' : 'Delete'}
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
                disabled={isSaving || config.columns.length === 0 || !isMainSelectorValid}
              >
                Save
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Save Preset</DrawerTitle>
                <DrawerDescription>Name your preset configuration.</DrawerDescription>
              </DrawerHeader>
              <div className="p-4">
                <Input
                  type="text"
                  placeholder="Preset name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  autoFocus
                  className="ph_hidden"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && presetName.trim()) {
                      handleSavePreset()
                    }
                  }}
                />
              </div>
              <DrawerFooter>
                <Button
                  onClick={handleSavePreset}
                  disabled={
                    isSaving ||
                    !presetName.trim() ||
                    config.columns.length === 0 ||
                    !isMainSelectorValid
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
        <div className="flex items-baseline gap-2">
          <h3 className="scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">
            Main Selector
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={-1}
                aria-label="Main selector info"
                className="cursor-default leading-none"
              >
                <HelpCircle className="w-4 h-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              This selector identifies the main elements to scrape
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="relative w-full">
          <Textarea
            id="mainSelector"
            className="field-sizing-content resize-none overflow-hidden min-h-9 ph_hidden"
            rows={1}
            value={mainSelectorDraft}
            onChange={(e) => handleMainSelectorChange(e.target.value)}
            onFocus={handleMainSelectorFocus}
            onBlur={handleMainSelectorBlur}
            placeholder="What do you want to scrape?"
            ref={mainSelectorInputRef}
            onKeyDown={handleAutosuggestKeyDown}
            style={{
              paddingRight: endAdornmentWidth ? endAdornmentWidth + 2 : undefined,
              paddingLeft: beginAdornmentWidth ? beginAdornmentWidth + 2 : undefined,
            }}
          />

          {/* Autosuggest dropdown using Command component (manual filtering) */}
          {isAutosuggestOpen && (
            <div
              className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg"
              ref={(el) => {
                autosuggestRef.current = el
                autosuggestContainerRef.current = el
              }}
            >
              <Command
                shouldFilter={false}
                value={cmdkSelectedId ?? '__none__'}
                onValueChange={setCmdkSelectedId}
                ref={commandRef as any}
                tabIndex={-1}
              >
                <CommandList className="max-h-60">
                  {recentSuggestions.length === 0 && filteredPresetsForAutosuggest.length === 0 ? (
                    <CommandEmpty>No suggestions found</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {/* Recent (non-preset) selectors */}
                      {recentSuggestions.length > 0 && (
                        <>
                          {recentSuggestions.map((selector, index) => (
                            <CommandItem
                              key={`recent-${index}-${selector}`}
                              value={`recent-${index}`}
                              onMouseDown={() => {
                                // Set flag on mousedown (before blur) to prevent blur handler from committing stale value
                                isSelectingFromAutosuggestRef.current = true
                              }}
                              onSelect={() => {
                                handleRecentSelectorSelect(selector)
                              }}
                              className="p-0"
                            >
                              <div className="flex items-center justify-between px-3 py-2 w-full">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ClockFading className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground font-mono ph_hidden truncate">
                                    {selector}
                                  </span>
                                </div>
                                <Button
                                  aria-label={`Remove recent selector`}
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 justify-center rounded hover:bg-destructive/10 opacity-70 hover:opacity-100 focus:outline-none"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    removeRecentMainSelector(selector).then(() => {
                                      getRecentMainSelectors().then((updated) => {
                                        setRecentSelectors(updated)
                                        // Keep dropdown open and move focus back to Command root
                                        requestAnimationFrame(() => {
                                          commandRef.current?.focus()
                                        })
                                      })
                                    })
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </CommandItem>
                          ))}
                          {/* Divider between recents and presets when both exist */}
                          {filteredPresetsForAutosuggest.length > 0 && (
                            <div className="h-px bg-border my-1 mx-1" />
                          )}
                        </>
                      )}

                      {/* Preset suggestions */}
                      {filteredPresetsForAutosuggest.map((preset, index) => (
                        <CommandItem
                          key={preset.id}
                          value={preset.id}
                          onMouseDown={() => {
                            // Set flag on mousedown (before blur) to prevent blur handler from committing stale value
                            isSelectingFromAutosuggestRef.current = true
                          }}
                          onSelect={() => handleAutosuggestSelect(preset)}
                          className="p-0"
                        >
                          <PresetItem
                            preset={preset}
                            onSelect={handleAutosuggestSelect}
                            onDelete={(preset) => {
                              handleRequestDeletePreset(preset)
                              setIsAutosuggestOpen(false)
                            }}
                            className="w-full hover:bg-transparent"
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
          {/* Begin adornment: visual picker button inside the input on the left */}
          <div ref={beginAdornmentRef} className="absolute inset-y-0 left-0 flex items-center pl-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  tabIndex={-1}
                  aria-label={pickerModeActive ? 'Close visual picker' : 'Open visual picker'}
                  className="size-7 p-0.5 rounded focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
                  onClick={onPickerMode}
                >
                  {pickerModeActive ? (
                    <LocateOff className="size-4" />
                  ) : (
                    <Crosshair className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                {pickerModeActive ? 'Close visual picker' : 'Pick element visually'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* End adornments: badges and info button */}
          <div
            ref={endAdornmentRef}
            className="absolute inset-y-0 right-0 flex items-center gap-x-1 pr-1"
          >
            {hasUncommittedChanges ? (
              // Empty div to reserve space for the badge and prevent layout shifts
              <div className="flex items-center justify-center min-w-[1.5rem] h-6" />
            ) : highlightError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge
                      variant="destructive"
                      className="flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 py-0 text-xs"
                    >
                      <OctagonAlert className="w-3.5 h-3.5" />
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="end">
                  {highlightError}
                </TooltipContent>
              </Tooltip>
            ) : isMainSelectorValid ? (
              <Badge
                variant={highlightMatchCount === 0 ? 'destructive' : 'default'}
                className="flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 py-0 text-xs"
              >
                {highlightMatchCount}
              </Badge>
            ) : (
              <div className="flex items-center justify-center min-w-[1.5rem] h-6" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  tabIndex={-1}
                  aria-label="Open XPath reference"
                  className="size-7 p-0.5 rounded focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
                  onClick={() =>
                    window.open(
                      'https://www.stylusstudio.com/docs/v62/d_xpath15.html',
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Info className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                Open XPath reference
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Columns section */}
      <div className="flex flex-col gap-4 items-start">
        <div className="flex items-baseline gap-2">
          <h3 className="scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight first:mt-0">
            Columns
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={-1} aria-label="Columns info" className="cursor-default leading-none">
                <HelpCircle className="w-4 h-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left">
              Define what data to extract from each main element. Use "." to get the text content of
              the element itself, or "@attr" to get an attribute
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex w-full justify-between">
          <div className="scroll-shadow-horizontal">
            <div
              className="grid grid-flow-col auto-cols-min gap-4 -ml-3 -mr-3"
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
                    className="p-2 border rounded text-sm ph_hidden"
                  />
                  <Input
                    type="text"
                    value={column.selector}
                    onChange={(e) => handleColumnSelectorChange(index, e.target.value)}
                    placeholder="Selector"
                    className="p-2 border rounded text-sm ph_hidden"
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
          </div>
          <div className="flex flex-col justify-between ml-3 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleGuessConfig}
                  loading={guessButtonState === 'generating'}
                  disabled={guessButtonState === 'generating' || !isMainSelectorValid}
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
                    trackEvent(ANALYTICS_EVENTS.ADD_COLUMN_BUTTON_PRESS)

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
        <div className="flex w-full justify-center mt-4 -mb-2 gap-2">
          <Button
            className="grow max-w-2xl"
            onClick={() => {
              trackEvent(ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS)
              onScrape()
            }}
            loading={isLoading}
            disabled={
              isLoading ||
              config.columns.length === 0 ||
              (!isMainSelectorValid && !hasUncommittedChanges)
            }
          >
            {hasUncommittedChanges ? (
              <>
                <SquareCheckBig className="w-4 h-4" />
                <span>Validate selector</span>
              </>
            ) : rescrapeAdvised && scrapeButtonState !== 'zero-found' ? (
              <>
                <RefreshCcw />
                <span>Scrape</span>
              </>
            ) : scrapeButtonState === 'zero-found' ? (
              '0 found'
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Scrape</span>
              </>
            )}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => {
                  browser.runtime.sendMessage({
                    type: MESSAGE_TYPES.OPEN_BATCH_SCRAPE,
                    payload: { config },
                  })
                }}
                disabled={isLoading || config.columns.length === 0}
              >
                <Layers className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Batch Scrape (multiple URLs)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

export default ConfigForm
