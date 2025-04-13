export type SelectorLanguage = 'xpath' | 'css'

export interface ColumnDefinition {
  name: string
  selector: string
  language: SelectorLanguage
}

export interface ScrapeConfig {
  mainSelector: string
  language: SelectorLanguage
  columns: ColumnDefinition[]
}

export interface ScrapedRow {
  [columnName: string]: string
}

export type ScrapedData = ScrapedRow[]

export interface Preset {
  id: string
  name: string
  config: ScrapeConfig
  createdAt: number
}

export interface SelectionOptions {
  selectors: {
    xpath: string
    css: string
  }
  selectedText?: string
  previewData?: ScrapedRow[]
}

export interface SidePanelConfig {
  initialSelectionText?: string
  elementDetails?: ElementDetailsPayload | null
  selectionOptions?: SelectionOptions
  currentScrapeConfig?: ScrapeConfig
}

export type ElementDetailsPayload = {
  xpath: string
  css: string
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

// Message types
export const MESSAGE_TYPES = {
  // From content script to background
  SELECTION_OPTIONS_READY: 'selection-options-ready',
  SCRAPE_DATA_READY: 'scrape-data-ready',
  CONTENT_SCRIPT_ERROR: 'content-script-error',
  CONTENT_SCRIPT_LOADED: 'content-script-loaded',

  // From background to content script
  GET_SELECTION_OPTIONS: 'get-selection-options',
  GET_ELEMENT_DETAILS: 'get-element-details',
  START_SCRAPE: 'start-scrape',
  HIGHLIGHT_ELEMENTS: 'highlight-elements',
  CONTEXT_MENU_ACTION_TRIGGERED: 'context-menu-action-triggered',
  ELEMENT_DETAILS_READY: 'element-details-ready',

  // From UI to background
  REQUEST_SCRAPE: 'request-scrape',
  REQUEST_HIGHLIGHT: 'request-highlight',
  EXPORT_TO_SHEETS: 'export-to-google-sheets',
  SAVE_PRESET: 'save-preset',
  LOAD_PRESETS: 'load-presets',
  DELETE_PRESET: 'delete-preset',

  // From background to UI
  SCRAPE_DATA_UPDATE: 'scrape-data-update',
  EXPORT_STATUS_UPDATE: 'export-status-update',
  PRESETS_UPDATED: 'presets-updated',
  INITIAL_OPTIONS: 'initial-options',

  // Added for tab-specific side panel
  SIDEPANEL_LOADED: 'sidepanel-loaded',
  UPDATE_PANEL_CONFIG: 'update-panel-config',
  INITIAL_OPTIONS_DATA: 'initial-options-data',

  // For Sidepanel Tab ID Management
  REQUEST_SIDEPANEL_TAB_ID: 'request-sidepanel-tab-id', // Sidepanel -> Background
  RESPONSE_SIDEPANEL_TAB_ID: 'response-sidepanel-tab-id', // Background -> Sidepanel
}
