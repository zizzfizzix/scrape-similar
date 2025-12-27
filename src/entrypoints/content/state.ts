import type { ScrapeConfig } from '@/utils/types'

export interface ElementDetails {
  xpath: string
  text: string
  html: string
}

export interface OriginalStyles {
  outline: string
  outlineOffset: string
  boxShadow: string
}

export interface PickerContextMenuApi {
  unmount: () => void
  updateLevel: (level: number) => void
  updateLevels: (levels: number, currentLevel: number) => void
  updatePosition: (x: number, y: number) => void
}

// Type for the shadow root UI returned by createShadowRootUi
export interface ShadowRootUi {
  mount: () => void
  remove: () => void
}

// Event handlers for picker mode cleanup
export interface PickerEventHandlers {
  mouseMoveHandler: (e: MouseEvent) => void
  clickHandler: (e: MouseEvent) => void
  keyDownHandler: (e: KeyboardEvent) => void
  contextMenuHandler: (e: MouseEvent) => void
  clickOutsideHandler: (e: MouseEvent) => void
  resizeHandler: () => void
}

// Core state (element selection and tab info)
export interface CoreState {
  tabId: number | null
  lastRightClickedElement: HTMLElement | null
  lastRightClickedElementDetails: ElementDetails | null
}

// Picker mode state (element selection and highlighting)
export interface PickerState {
  pickerModeActive: boolean
  highlightedElements: Map<HTMLElement, OriginalStyles>
  currentHoveredElement: HTMLElement | null
  currentXPath: string
  currentGuessedConfig: ScrapeConfig | null
  selectorCandidates: string[]
  selectedCandidateIndex: number
  mouseUpdateScheduled: boolean
  lastMouseX: number
  lastMouseY: number
  pickerEventHandlers: PickerEventHandlers | null
}

// Banner UI state
export interface BannerState {
  pickerBannerUi: ShadowRootUi | null
  bannerRootEl: HTMLDivElement | null
  bannerCountEl: HTMLSpanElement | null
  bannerXPathEl: HTMLInputElement | null
  bannerCloseBtn: HTMLButtonElement | null
  originalBodyMarginTopInline: string | null
  originalBodyMarginTopComputedPx: number | null
  bannerSetData: ((count: number, xpath: string) => void) | null
}

// Context menu state
export interface ContextMenuState {
  pickerContextMenuHost: HTMLDivElement | null
  pickerContextMenuUi: ShadowRootUi | null
  pickerContextMenuOpen: boolean
  pickerContextMenuApi: PickerContextMenuApi | null
  originalFixedElementTops: Map<HTMLElement, string>
  pickerScrollAccumulator: number
  contextMenuX: number
  contextMenuY: number
  contextMenuWheelHandler: ((e: WheelEvent) => void) | null
}

// Combined state interface
export interface ContentScriptState extends CoreState, PickerState, BannerState, ContextMenuState {}

export const createState = (): ContentScriptState => ({
  // Core state
  tabId: null,
  lastRightClickedElement: null,
  lastRightClickedElementDetails: null,

  // Picker mode state
  pickerModeActive: false,
  highlightedElements: new Map(),
  currentHoveredElement: null,
  currentXPath: '',
  currentGuessedConfig: null,
  selectorCandidates: [],
  selectedCandidateIndex: 0,
  mouseUpdateScheduled: false,
  lastMouseX: 0,
  lastMouseY: 0,

  // Banner UI state
  pickerBannerUi: null,
  bannerRootEl: null,
  bannerCountEl: null,
  bannerXPathEl: null,
  bannerCloseBtn: null,
  originalBodyMarginTopInline: null,
  originalBodyMarginTopComputedPx: null,
  bannerSetData: null,

  // Context menu state
  pickerContextMenuHost: null,
  pickerContextMenuUi: null,
  pickerContextMenuOpen: false,
  pickerContextMenuApi: null,
  originalFixedElementTops: new Map(),
  pickerScrollAccumulator: 0,
  contextMenuX: 0,
  contextMenuY: 0,
  contextMenuWheelHandler: null,
  pickerEventHandlers: null,
})
