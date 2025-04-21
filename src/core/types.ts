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
  scrapedData?: ScrapedData
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
  CONTENT_SCRIPT_ERROR: 'content-script-error',
  CONTENT_SCRIPT_LOADED: 'content-script-loaded',
  ELEMENT_DETAILS_READY: 'element-details-ready',

  // From background to content script
  REQUEST_CACHED_ELEMENT_DETAILS: 'request-cached-element-details',
  START_SCRAPE: 'start-scrape',
  HIGHLIGHT_ELEMENTS: 'highlight-elements',
  CONTEXT_MENU_ACTION_TRIGGERED: 'context-menu-action-triggered',
  GUESS_CONFIG_FROM_SELECTOR: 'guess-config-from-selector',

  EXPORT_TO_SHEETS: 'export-to-google-sheets',

  // From background to UI
  EXPORT_STATUS_UPDATE: 'export-status-update',
}
