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
import {
  buildSuggestionIds,
  filterPresetsByQuery,
  filterRecentSelectors,
  isSelectorAPreset,
  nextSuggestionIndex,
  RECENT_SUGGESTION_PREFIX,
  resolveSuggestion,
} from '@/utils/autosuggest'
import {
  sanitizeToSingleLine,
  withAddedColumn,
  withColumnName,
  withColumnSelector,
  withoutColumn,
} from '@/utils/scrape-config'
import log from 'loglevel'

import {
  Check,
  ChevronsUpDown,
  ClockFading,
  Crosshair,
  HelpCircle,
  Info,
  Loader2,
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

// How long the "0 found" feedback stays on the scrape button after a scrape
// that returned no rows.
const ZERO_FOUND_FEEDBACK_MS = 1500

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

export const ConfigForm: React.FC<ConfigFormProps> = ({
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
  const columnsListRef = useRef<HTMLDivElement>(null)
  const prevColumnsCount = useRef(config.columns.length)
  const [shouldScrollToEnd, setShouldScrollToEnd] = useState(false)
  const [guessButtonState, setGuessButtonState] = useState<
    'idle' | 'generating' | 'success' | 'failure'
  >('idle')

  // State for Save Preset drawer
  const [isSaveDrawerOpen, setIsSaveDrawerOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // State for Load Preset combobox
  const [isLoadPopoverOpen, setIsLoadPopoverOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  // State for delete confirmation drawer
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
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

  // An external change (preset load, storage sync) replaces whatever is in the
  // input. Adjusting during render rather than from an effect keeps the frame
  // that would otherwise show the superseded draft off the screen.
  const [syncedMainSelector, setSyncedMainSelector] = useState(config.mainSelector)
  if (syncedMainSelector !== config.mainSelector) {
    setSyncedMainSelector(config.mainSelector)
    setMainSelectorDraft(config.mainSelector)
    setIsAutosuggestOpen(false)
  }

  // Add ref and state for dynamic end adornment width
  const [endAdornmentWidth, setEndAdornmentWidth] = useState(0)
  const endAdornmentRef = useRef<HTMLDivElement>(null)
  // Add ref and state for dynamic begin adornment width (left side inside input)
  const [beginAdornmentWidth, setBeginAdornmentWidth] = useState(0)
  const beginAdornmentRef = useRef<HTMLDivElement>(null)

  // Derived flags
  const hasUncommittedChanges = mainSelectorDraft !== config.mainSelector

  // Show highlight/error badges only when a non-empty selector is committed
  const isMainSelectorValid = isMainSelectorValidated({
    mainSelector: mainSelectorDraft,
    hasUncommittedChanges,
    highlightMatchCount,
    highlightError,
  })

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
      // The strip is rendered unconditionally, so the ref is always attached by
      // the time an added column can schedule this.
      columnsListRef.current!.scrollTo({
        left: columnsListRef.current!.scrollWidth,
        behavior: 'smooth',
      })
      setShouldScrollToEnd(false)
    }
    prevColumnsCount.current = config.columns.length
  }, [config.columns.length, shouldScrollToEnd])

  // Keep the latest clear callback in a ref so the feedback timer below does not
  // depend on the parent re-creating the callback on every render.
  const onClearLastScrapeRowCountRef = useRef(onClearLastScrapeRowCount)
  useEffect(() => {
    onClearLastScrapeRowCountRef.current = onClearLastScrapeRowCount
  }, [onClearLastScrapeRowCount])

  // The button reports "0 found" while that report is both current and unspent,
  // so the only state here is the timer's verdict; the count stays the parent's.
  const [isZeroFoundReportSpent, setIsZeroFoundReportSpent] = useState(false)
  const [reportedRowCount, setReportedRowCount] = useState(lastScrapeRowCount)
  if (reportedRowCount !== lastScrapeRowCount) {
    setReportedRowCount(lastScrapeRowCount)
    setIsZeroFoundReportSpent(false)
  }
  const scrapeButtonState =
    lastScrapeRowCount === 0 && !isZeroFoundReportSpent ? 'zero-found' : 'idle'

  // Depends on lastScrapeRowCount only: if the callback identity were a dependency
  // the cleanup would cancel and the body would restart the timer on every parent
  // render, so the "0 found" feedback could outlive the scrape it belongs to.
  useEffect(() => {
    // No scrape feedback pending (or it was invalidated by a config change).
    if (typeof lastScrapeRowCount !== 'number') return

    if (lastScrapeRowCount !== 0) {
      onClearLastScrapeRowCountRef.current?.()
      return
    }

    const timeout = setTimeout(() => {
      setIsZeroFoundReportSpent(true)
      onClearLastScrapeRowCountRef.current?.()
    }, ZERO_FOUND_FEEDBACK_MS)
    return () => clearTimeout(timeout)
  }, [lastScrapeRowCount])

  // Both adornment wrappers are rendered unconditionally, so their refs are
  // attached before any of these effects can run.
  useEffect(() => {
    setEndAdornmentWidth(endAdornmentRef.current!.offsetWidth)
  }, [highlightError, highlightMatchCount])

  useEffect(() => {
    setBeginAdornmentWidth(beginAdornmentRef.current!.offsetWidth)
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
    onChange(withColumnName(config, index, value))
  }

  // Handle column selector change
  const handleColumnSelectorChange = (index: number, value: string) => {
    onChange(withColumnSelector(config, index, value))
  }

  // Remove a column
  const removeColumn = (index: number) => {
    trackEvent(ANALYTICS_EVENTS.REMOVE_COLUMN_BUTTON_PRESS)

    onChange(withoutColumn(config, index))
  }

  /**
   * Guess the columns for the current selector.
   *
   * The button is disabled until the selector is non-blank, committed and
   * validated, so the draft agrees with the config by the time this runs.
   */
  const handleGuessConfig = async () => {
    const selector = mainSelectorDraft.trim()

    // Track auto-generate config button press
    trackEvent(ANALYTICS_EVENTS.AUTO_GENERATE_CONFIG_BUTTON_PRESS)

    setGuessButtonState('generating')
    try {
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
    } catch {
      setGuessButtonState('failure')
      setTimeout(() => setGuessButtonState('idle'), 1500)
    }
  }

  // Save Preset handler. Both the Save button and the Enter shortcut in the
  // name field require a non-blank name, so there is nothing to re-check here.
  const handleSavePreset = async () => {
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
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeletePreset = () => {
    if (presetToDelete) {
      onDeletePreset(presetToDelete)
    }
    setIsDeleteDialogOpen(false)
    setPresetToDelete(null)
  }

  const handleCancelDeletePreset = () => {
    setIsDeleteDialogOpen(false)
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

  /**
   * The blur handler defers so a click on a suggestion still lands, which means
   * the input can be focused again - or the form gone - by the time it fires.
   * Holding the timer lets those cases cancel a blur that no longer applies.
   */
  const blurCommitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(blurCommitTimerRef.current), [])

  // Opening never carries a selection over from the last time the list was
  // open; the arrow-key handlers below move off -1 once it is open. Refocusing
  // or typing into an already-open list is not an opening, and leaves the
  // highlighted item where it is.
  const openAutosuggest = () => {
    if (isAutosuggestOpen) return
    setIsAutosuggestOpen(true)
    setSelectedAutosuggestIndex(-1)
    setCmdkSelectedId(undefined)
  }

  // Handle main selector focus
  const handleMainSelectorFocus = () => {
    // Focus is back, so a blur still waiting out its delay no longer applies.
    // Drawers and dialogs restore focus to their trigger when they close, which
    // blurs the textarea; the user clicks straight back in and keeps typing, and
    // without this the pending timer closes the suggestions under them.
    clearTimeout(blurCommitTimerRef.current)
    openAutosuggest()
  }

  // Handle main selector blur with delay to allow for clicks
  const handleMainSelectorBlur = () => {
    clearTimeout(blurCommitTimerRef.current)
    blurCommitTimerRef.current = setTimeout(() => {
      // Don't commit if we're selecting from autosuggest (mousedown was triggered)
      if (isSelectingFromAutosuggestRef.current) {
        isSelectingFromAutosuggestRef.current = false
        return
      }

      // If focus moved into the autosuggest dropdown, keep it open
      const active = document.activeElement as HTMLElement | null
      const hasMovedIntoDropdown = !!(active && autosuggestRef.current?.contains(active))
      if (hasMovedIntoDropdown) return

      setIsAutosuggestOpen(false)
      commitMainSelector(mainSelectorDraft)
    }, 150)
  }

  /**
   * Cancelling the pending blur commit is what makes validating here work: the
   * press blurs the textarea first, and that commit is deferred by 150ms so a
   * click on a suggestion still lands, so scraping instead would carry the
   * selector the user has just moved away from (#271).
   */
  const handleMainActionPress = () => {
    if (hasUncommittedChanges) {
      clearTimeout(blurCommitTimerRef.current)
      setIsAutosuggestOpen(false)
      commitMainSelector(mainSelectorDraft)
      return
    }

    trackEvent(ANALYTICS_EVENTS.SCRAPE_BUTTON_PRESS)
    onScrape()
  }

  // Handle main selector change with autosuggest (newline-less)
  const handleMainSelectorChange = (value: string) => {
    const sanitized = sanitizeToSingleLine(value)
    setMainSelectorDraft(sanitized)
    // Keep dropdown open while typing (including when cleared) if the textarea has focus
    openAutosuggest()
    // When cleared, reset selection but do not close; show all suggestions
    if (sanitized.length === 0) {
      setSelectedAutosuggestIndex(-1)
      setCmdkSelectedId(undefined)
    }
  }

  // Presets filtered by the main selector draft (acts as search term)
  const filteredPresetsForAutosuggest = React.useMemo(
    () => filterPresetsByQuery(presets, mainSelectorDraft || ''),
    [presets, mainSelectorDraft],
  )

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

  const recentSuggestions = React.useMemo(
    () => filterRecentSelectors(recentSelectors, presets, mainSelectorDraft || ''),
    [recentSelectors, presets, mainSelectorDraft],
  )

  // Combined navigation order for cmdk (recents first, then presets)
  const combinedSuggestionValues = React.useMemo(
    () => buildSuggestionIds(recentSuggestions, filteredPresetsForAutosuggest),
    [recentSuggestions, filteredPresetsForAutosuggest],
  )

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
        openAutosuggest()
        // after open, focus command root so cmdk handles keys
        requestAnimationFrame(() => {
          commandRef.current?.focus()
          setSelectedAutosuggestIndex(0)
          setCmdkSelectedId(combinedSuggestionValues[0])
          ensureVisible(0)
        })
      } else if (combinedSuggestionValues.length > 0) {
        setSelectedAutosuggestIndex((prev) => {
          const next = nextSuggestionIndex(prev, combinedSuggestionValues.length, 1)
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
        openAutosuggest()
        requestAnimationFrame(() => {
          commandRef.current?.focus()
          const last = Math.max(0, combinedSuggestionValues.length - 1)
          setSelectedAutosuggestIndex(last)
          setCmdkSelectedId(combinedSuggestionValues[last])
          ensureVisible(last)
        })
      } else if (combinedSuggestionValues.length > 0) {
        setSelectedAutosuggestIndex((prev) => {
          const next = nextSuggestionIndex(prev, combinedSuggestionValues.length, -1)
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
        const suggestion = resolveSuggestion(
          combinedSuggestionValues[selectedAutosuggestIndex],
          recentSuggestions,
          filteredPresetsForAutosuggest,
        )
        if (suggestion?.kind === 'recent') handleRecentSelectorSelect(suggestion.selector)
        if (suggestion?.kind === 'preset') handleAutosuggestSelect(suggestion.preset)
        return
      }
      if (mainSelectorDraft.trim()) {
        // Save to recents if not a preset, then either validate (if changed) or scrape (if unchanged and valid)
        ;(async () => {
          const all = await getAllPresets()
          if (!isSelectorAPreset(mainSelectorDraft, all)) {
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
          <Drawer open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : null}
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
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : null}
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
                              key={`${RECENT_SUGGESTION_PREFIX}${index}-${selector}`}
                              value={`${RECENT_SUGGESTION_PREFIX}${index}`}
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
                      {filteredPresetsForAutosuggest.map((preset) => (
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
                  disabled={guessButtonState === 'generating' || !isMainSelectorValid}
                  aria-label="Auto-generate configuration from selector"
                >
                  {guessButtonState === 'generating' ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : guessButtonState === 'success' ? (
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

                    onChange(withAddedColumn(config, `Column ${config.columns.length + 1}`))
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
            onClick={handleMainActionPress}
            disabled={
              isLoading ||
              config.columns.length === 0 ||
              (!isMainSelectorValid && !hasUncommittedChanges)
            }
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : null}
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
        </div>
      </div>
    </div>
  )
}
