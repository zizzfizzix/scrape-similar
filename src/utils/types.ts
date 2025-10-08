export interface ColumnDefinition {
  name: string
  selector: string
  key?: string
}

export interface ScrapeConfig {
  mainSelector: string
  columns: ColumnDefinition[]
}

export interface ScrapedRowData {
  [columnName: string]: string
}

export interface ScrapedRowMetadata {
  originalIndex: number
  isEmpty: boolean
}

export interface ScrapedRow {
  data: ScrapedRowData
  metadata: ScrapedRowMetadata
}

export type ScrapedData = ScrapedRow[]

export interface ScrapeResult {
  data: ScrapedData
  columnOrder: string[]
}

export interface Preset {
  id: string
  name: string
  config: ScrapeConfig
  createdAt: number
}

export interface SelectionOptions {
  xpath: string
  selectedText?: string
}

export interface SidePanelConfig {
  initialSelectionText?: string
  elementDetails?: ElementDetailsPayload | null
  selectionOptions?: SelectionOptions
  currentScrapeConfig?: ScrapeConfig
  scrapeResult?: ScrapeResult
  resultProducingConfig?: ScrapeConfig // Config that produced the current scrapeResult
  highlightMatchCount?: number | null
  highlightError?: string | null
}

export type ElementDetailsPayload = {
  xpath: string
  text?: string
} | null

export type ExportResult = {
  success: boolean
  url?: string
  error?: string
}

export interface Message<T = any> {
  type: string
  payload?: T
}

export type MessageResponse =
  | {
      success: true
      tabId?: number
      debugMode?: boolean
    }
  | {
      success: false
      error: string
    }
  | {
      success: false
      warning: string
    }
  | {
      success: true
      url: string
    }

// Message types
export const MESSAGE_TYPES = {
  // From background to content script
  DEBUG_MODE_CHANGED: 'DEBUG_MODE_CHANGED',
  SAVE_ELEMENT_DETAILS_TO_STORAGE: 'save-element-details-to-storage',

  // From sidepanel to content script
  START_SCRAPE: 'start-scrape',
  HIGHLIGHT_ELEMENTS: 'highlight-elements',
  HIGHLIGHT_ROW_ELEMENT: 'highlight-row-element',
  GUESS_CONFIG_FROM_SELECTOR: 'guess-config-from-selector',
  ENABLE_PICKER_MODE: 'enable-picker-mode',
  DISABLE_PICKER_MODE: 'disable-picker-mode',

  // From sidepanel to background
  EXPORT_TO_SHEETS: 'export-to-google-sheets',

  // From content script to background
  GET_DEBUG_MODE: 'GET_DEBUG_MODE',
  GET_MY_TAB_ID: 'GET_MY_TAB_ID',
  TRACK_EVENT: 'TRACK_EVENT',

  // From sidepanel or content script to background
  UPDATE_SIDEPANEL_DATA: 'update-sidepanel-data',

  // From any entrypoint to background
  OPEN_SIDEPANEL: 'open_sidepanel',

  // Onboarding demo
  TRIGGER_DEMO_SCRAPE: 'trigger_demo_scrape',
} as const

// Analytics message payload interface
export interface TrackEventPayload {
  eventName: string
  properties: Record<string, any>
}

export interface SystemPresetStatusMap {
  [presetId: string]: boolean
}

export const SYSTEM_PRESET_STATUS_KEY = 'system_preset_status' as const
