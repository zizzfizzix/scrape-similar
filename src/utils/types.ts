export interface ColumnDefinition {
  name: string
  selector: string
  key?: string
}

export interface ScrapeConfig {
  mainSelector: string
  columns: ColumnDefinition[]
}

export type ScrapedRowData = Record<string, string>

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

export interface SidePanelConfig {
  elementDetails?: ElementDetailsPayload | null
  currentScrapeConfig?: ScrapeConfig
  scrapeResult?: ScrapeResult
  resultProducingConfig?: ScrapeConfig // Config that produced the current scrapeResult
  highlightMatchCount?: number | null
  highlightError?: string | null
  pickerModeActive?: boolean
}

/**
 * A write to a tab's `SidePanelConfig`. A field `currentScrapeConfig` omits
 * takes the value the side panel shows for the stored state (see
 * `applySidePanelDataUpdates`), so a writer sends only what it changed. An
 * update cannot remove the stored config: one with no config fields, or with
 * `currentScrapeConfig: undefined`, leaves it as it is.
 */
export interface SidePanelConfigUpdate extends Omit<
  Partial<SidePanelConfig>,
  'currentScrapeConfig'
> {
  currentScrapeConfig?: Partial<ScrapeConfig>
}

export type ElementDetailsPayload = {
  xpath: string
  text?: string
} | null

export interface Message<T = unknown> {
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

/**
 * Replies as their receivers read them. `sendMessage` takes a reply's type from
 * the variable or callback parameter that receives it, `any` when that has no
 * annotation, and nothing validates it.
 */
export interface StatusReply {
  success: boolean
  error?: string
}

/** The background's reply to EXPORT_TO_SHEETS, and what the export returns. */
export interface ExportResult extends StatusReply {
  url?: string
}

/** A content script's reply to HIGHLIGHT_ELEMENTS. */
export interface HighlightReply extends StatusReply {
  matchCount?: number
}

/** A content script's reply to START_SCRAPE. */
export interface ScrapeReply extends StatusReply {
  data?: ScrapeResult
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
  TOGGLE_PICKER_MODE: 'toggle-picker-mode',

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
  eventName: AnalyticsEvent
  properties: AnalyticsProperties
}

/** Payload of ENABLE_PICKER_MODE, DISABLE_PICKER_MODE and TOGGLE_PICKER_MODE. */
export interface PickerModePayload {
  source?: AnalyticsSource
}

export type SystemPresetStatusMap = Record<string, boolean>

export type Theme = 'dark' | 'light' | 'system'
