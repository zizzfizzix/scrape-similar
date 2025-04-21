export interface ColumnDefinition {
  name: string
  selector: string
}

export interface ScrapeConfig {
  mainSelector: string
  columns: ColumnDefinition[]
}

export interface ScrapedRow {
  [columnName: string]: string
}

export type ScrapedData = ScrapedRow[]

export interface ScrapedDataResult {
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
  // From background to content script
  SAVE_ELEMENT_DETAILS_TO_STORAGE: 'save-element-details-to-storage',

  // From sidepanel to content script
  START_SCRAPE: 'start-scrape',
  HIGHLIGHT_ELEMENTS: 'highlight-elements',
  GUESS_CONFIG_FROM_SELECTOR: 'guess-config-from-selector',

  // From sidepanel to background
  EXPORT_TO_SHEETS: 'export-to-google-sheets',
}
