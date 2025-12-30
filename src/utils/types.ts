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
  // Note: scrapeResult is now stored in Dexie, not in session storage
  highlightMatchCount?: number | null
  highlightError?: string | null
  pickerModeActive?: boolean
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
  | {
      success: true
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
  SCRAPE_PAGE: 'scrape-page', // Request background to scrape a page

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

  // Batch scrape operations
  BATCH_SCRAPE_START: 'batch-scrape-start',
  BATCH_SCRAPE_PAUSE: 'batch-scrape-pause',
  BATCH_SCRAPE_RESUME: 'batch-scrape-resume',
  BATCH_SCRAPE_RETRY_URL: 'batch-scrape-retry-url',
  BATCH_SCRAPE_PREVIEW: 'batch-scrape-preview',
  OPEN_BATCH_SCRAPE: 'open-batch-scrape',
  OPEN_BATCH_SCRAPE_HISTORY: 'open-batch-scrape-history',
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

// Batch scrape related interfaces
export interface BatchScrapeStartPayload {
  batchId: string
}

export interface BatchScrapeRetryPayload {
  batchId: string
  urlResultId: string
}

export interface BatchScrapePreviewPayload {
  config: ScrapeConfig
  url: string
}

export interface OpenBatchScrapePayload {
  config?: ScrapeConfig
  batchId?: string // For resuming existing batch
  urls?: string[] // URLs to pre-populate in the batch scrape form
}

// Shared UI types
export interface StorageUsage {
  used: number
  quota: number
  percentUsed: number
}

// Re-export ButtonSize from button variants for reuse across components
// This avoids importing class-variance-authority in every component that needs button sizes
import type { buttonVariants } from '@/components/ui/button'
import type { VariantProps } from 'class-variance-authority'
export type ButtonSize = VariantProps<typeof buttonVariants>['size']
