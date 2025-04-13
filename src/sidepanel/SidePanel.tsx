import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  MESSAGE_TYPES,
  ScrapeConfig,
  ScrapedData,
  SelectionOptions,
  Preset,
  SidePanelConfig,
  ElementDetailsPayload,
  Message,
} from '../core/types'
import ConfigForm from './components/ConfigForm'
import DataTable from './components/DataTable'
import PresetsManager from './components/PresetsManager'
import ExportButton from './components/ExportButton'
import './SidePanel.css'

const SidePanel: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'config' | 'data' | 'presets'>('config')
  const [targetTabId, setTargetTabId] = useState<number | null>(null)
  // Ref to hold the current targetTabId
  const targetTabIdRef = useRef<number | null>(targetTabId);
  const [initialOptions, setInitialOptions] = useState<SelectionOptions | null>(null)
  const [config, setConfig] = useState<ScrapeConfig>({
    mainSelector: '',
    language: 'xpath',
    columns: [{ name: 'Text', selector: '.', language: 'xpath' }],
  })
  const [scrapedData, setScrapedData] = useState<ScrapedData>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [exportStatus, setExportStatus] = useState<{
    success?: boolean
    url?: string
    error?: string
  } | null>(null)

  // Keep the ref updated whenever the state changes
  useEffect(() => {
    targetTabIdRef.current = targetTabId;
  }, [targetTabId]);

  // Request tabId from background script on mount
  useEffect(() => {
    console.log('SidePanel mounted, requesting tabId from background...');
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.REQUEST_SIDEPANEL_TAB_ID }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error requesting tabId:', chrome.runtime.lastError.message);
      } else if (response && response.tabId) {
        console.log(`Received initial tabId: ${response.tabId}`);
        setTargetTabId(response.tabId);
        // Now that we have the tabId, tell the background we are loaded for this tab
        chrome.runtime.sendMessage(
          { type: MESSAGE_TYPES.SIDEPANEL_LOADED, payload: { tabId: response.tabId } },
          (initResponse) => {
            if (chrome.runtime.lastError) {
              console.error('Error sending SIDEPANEL_LOADED:', chrome.runtime.lastError);
              return;
            }
            console.log('SIDEPANEL_LOADED message sent, background responded:', initResponse);
            // Handle the initial data sent back immediately
            if (initResponse && initResponse.type === MESSAGE_TYPES.INITIAL_OPTIONS_DATA) {
              if (initResponse.payload.tabId === targetTabIdRef.current) {
                handleInitialData(initResponse.payload);
              } else {
                console.warn(`Initial SIDEPANEL_LOADED response for wrong tab ${initResponse.payload.tabId}, expected ${targetTabIdRef.current}`);
              }
            }
          }
        );
      } else {
        console.error('Received invalid response for tabId request:', response);
      }
    });
  }, []);

  // Debounced function to save config changes to background session storage
  const debouncedSaveConfig = useCallback(
    debounce((newConfig: ScrapeConfig, tabId: number) => {
      console.log(`Debounced save for tab ${tabId}:`, newConfig)
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPDATE_PANEL_CONFIG,
        payload: {
          tabId,
          config: { currentScrapeConfig: newConfig } as Partial<SidePanelConfig>,
        },
      })
    }, 500), // 500ms debounce interval
    [],
  )

  // Update config state and trigger debounced save
  const handleConfigChange = (newConfig: ScrapeConfig) => {
    setConfig(newConfig)
    if (targetTabId !== null) {
      debouncedSaveConfig(newConfig, targetTabId)
    }
  }

  // Function to handle incoming initial/updated config data
  const handleInitialData = useCallback((payload: { tabId: number; config: Partial<SidePanelConfig> }) => {
    // --- Use the ref for validation ---
    const currentExpectedTabId = targetTabIdRef.current;
    if (payload.tabId !== currentExpectedTabId) {
      console.warn(`handleInitialData called for wrong tab ${payload.tabId}, expected ${currentExpectedTabId}`);
      return;
    }
    // --- End validation change ---

    console.log(`Received initial/updated data for tab ${currentExpectedTabId}:`, payload.config);
    const { selectionOptions, elementDetails, currentScrapeConfig, initialSelectionText } = payload.config || {}; // Default to empty object

    // --- Reset state before applying new data ---
    const defaultConfig: ScrapeConfig = {
        mainSelector: '',
        language: 'xpath',
        columns: [{ name: 'Text', selector: '.', language: 'xpath' }],
    };
    let newConfig = defaultConfig;
    let newOptions: SelectionOptions | null = null; // Explicitly allow null

    // Set config from storage if available
    if (currentScrapeConfig) {
      console.log('Loading config from session storage:', currentScrapeConfig)
      newConfig = currentScrapeConfig;
    } else if (elementDetails?.xpath) {
      // Fallback: If no saved config, but element details exist (e.g., from context menu),
      // initialize config with the XPath from the selected element.
      console.log('Initializing config from elementDetails XPath:', elementDetails.xpath)
      newConfig = {
        ...defaultConfig, // Start with default columns
        mainSelector: elementDetails.xpath,
        language: 'xpath',
      };
    }
    // Update the config state
    setConfig(newConfig);


    // Update initial options used by the ConfigForm
    if (selectionOptions) {
      console.log('Setting initialOptions from selectionOptions:', selectionOptions)
      newOptions = selectionOptions;
    } else if (elementDetails) {
      // Construct initialOptions from elementDetails if selectionOptions not available
      console.log('Constructing initialOptions from elementDetails')
      const options: SelectionOptions = {
        selectors: {
          xpath: elementDetails.xpath,
          css: elementDetails.css,
        },
        selectedText: initialSelectionText || elementDetails.text,
        previewData: [], // Preview might need separate handling or message
      }
      newOptions = options;
    }
    // Update the initialOptions state
    setInitialOptions(newOptions);

    // Clear potentially stale data from previous tab
    setScrapedData([]);
    setIsLoading(false); // Ensure loading state is reset
    setExportStatus(null); // Reset export status
  }, []);

  // Initialize: load presets, listen for messages, AND listen for tab activation
  useEffect(() => {
    // Load presets
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.LOAD_PRESETS }, (loadedPresets) => {
      setPresets(loadedPresets || [])
    })

    // Listen for messages from background script
    const messageListener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      // --- Use the ref for validation ---
      const currentExpectedTabId = targetTabIdRef.current;
      // Allow specific messages even if tabId isn't set yet (like the initial response)
      // The main check will be inside the specific message type handlers

      console.log(`Message received in listener. Type: ${message.type}. Current expected tabId: ${currentExpectedTabId}. Message tabId: ${message.payload?.tabId}`);

      switch (message.type) {

        // Replace INITIAL_OPTIONS with INITIAL_OPTIONS_DATA
        case MESSAGE_TYPES.INITIAL_OPTIONS_DATA:
          // Use the ref for validation
          if (currentExpectedTabId !== null && message.payload.tabId === currentExpectedTabId) {
            console.log(`Listener handling INITIAL_OPTIONS_DATA for correct tab ${currentExpectedTabId}`);
            handleInitialData(message.payload)
          } else {
            console.warn(`Listener ignoring INITIAL_OPTIONS_DATA for tab ${message.payload.tabId}, expected ${currentExpectedTabId}`);
          }
          break

        case MESSAGE_TYPES.SCRAPE_DATA_UPDATE:
          // Use the ref for validation
          if (currentExpectedTabId !== null && message.payload.tabId === currentExpectedTabId) {
            console.log(`Listener handling SCRAPE_DATA_UPDATE for correct tab ${currentExpectedTabId}`);
            setScrapedData(message.payload.data) // Assuming payload is { tabId: number, data: ScrapedData }
            setActiveTab('data')
            setIsLoading(false)
          } else {
            console.warn(`Listener ignoring SCRAPE_DATA_UPDATE for tab ${message.payload.tabId}, expected ${currentExpectedTabId}`);
          }
          break

        case MESSAGE_TYPES.EXPORT_STATUS_UPDATE:
          // Use the ref for validation
          if (currentExpectedTabId !== null && message.payload.tabId === currentExpectedTabId) {
            setExportStatus(message.payload.status) // Assuming payload is { tabId: number, status: ExportResult }
            setIsLoading(false)
          } else {
              console.warn(`Listener ignoring EXPORT_STATUS_UPDATE for tab ${message.payload.tabId}, expected ${currentExpectedTabId}`);
          }
          break

        case MESSAGE_TYPES.PRESETS_UPDATED:
          // Update presets (not tab-specific, usually)
          setPresets(message.payload)
          break

        default:
          // Optional: Log unhandled message types
          // console.log("SidePanel listener received unhandled message type:", message.type);
          break
      }
    }

    // Listen for tab activation
    const tabActivationListener = (activeInfo: chrome.tabs.TabActiveInfo) => {
      console.log(`SidePanel detected tab activation: ${activeInfo.tabId}`);
      const newTabId = activeInfo.tabId;
      setTargetTabId(newTabId); // Update state (which updates ref via its effect)

      // Send SIDEPANEL_LOADED immediately after activation is detected and state is set
      // The background will use this message to send back the correct INITIAL_OPTIONS_DATA
      console.log(`SidePanel sending SIDEPANEL_LOADED for newly activated tab ${newTabId}`);
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.SIDEPANEL_LOADED, payload: { tabId: newTabId } },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(`Error sending SIDEPANEL_LOADED on tab activation for tab ${newTabId}:`, chrome.runtime.lastError);
            return;
          }
          console.log(`SIDEPANEL_LOADED message sent on tab activation for tab ${newTabId}, background responded:`, response);
           // Handle immediate response if background sends data directly here
           // Check type and use ref for validation
           if (response && response.type === MESSAGE_TYPES.INITIAL_OPTIONS_DATA) {
               if (response.payload.tabId === targetTabIdRef.current) { // Check against ref *after* potential state update
                   handleInitialData(response.payload);
               } else {
                   console.warn(`Tab activation SIDEPANEL_LOADED response for wrong tab ${response.payload.tabId}, expected ${targetTabIdRef.current}`);
               }
           }
        }
      );
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.tabs.onActivated.addListener(tabActivationListener);

    // Cleanup listeners on component unmount
    return () => {
      console.log('SidePanel unmounting, removing listeners...');
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onActivated.removeListener(tabActivationListener);
    };
    // Dependencies: only handleInitialData (which itself has limited/no dependencies now)
  }, [handleInitialData]);

  // Handle scrape request
  const handleScrape = () => {
    if (!targetTabId) return

    setIsLoading(true)
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.REQUEST_SCRAPE,
      payload: {
        tabId: targetTabId,
        config,
      },
    })
  }

  // Handle highlight request
  const handleHighlight = (selector: string, language: string) => {
    if (!targetTabId) return

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.REQUEST_HIGHLIGHT,
      payload: {
        tabId: targetTabId,
        selector,
        language,
      },
    })
  }

  // Handle export request
  const handleExport = () => {
    setIsLoading(true)
    setExportStatus(null)

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPORT_TO_SHEETS,
      payload: scrapedData,
    })
  }

  // Handle loading a preset
  const handleLoadPreset = (preset: Preset) => {
    // Use the config change handler to update state and save
    handleConfigChange(preset.config)
    setActiveTab('config')
  }

  // Handle saving a preset
  const handleSavePreset = (name: string) => {
    const preset: Preset = {
      id: Date.now().toString(),
      name,
      config,
      createdAt: Date.now(),
    }

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.SAVE_PRESET,
      payload: preset,
    })
  }

  // Handle deleting a preset
  const handleDeletePreset = (presetId: string) => {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.DELETE_PRESET,
      payload: presetId,
    })
  }

  return (
    <div className="side-panel">
      <header className="header">
        <h1>Modern Scraper</h1>
        <div className="tabs">
          <button
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
          <button
            className={activeTab === 'data' ? 'active' : ''}
            onClick={() => setActiveTab('data')}
            disabled={scrapedData.length === 0}
          >
            Data ({scrapedData.length})
          </button>
          <button
            className={activeTab === 'presets' ? 'active' : ''}
            onClick={() => setActiveTab('presets')}
          >
            Presets
          </button>
        </div>
      </header>

      <main className="content">
        {activeTab === 'config' && (
          <div className="config-panel">
            <ConfigForm
              config={config}
              onChange={handleConfigChange}
              onScrape={handleScrape}
              onHighlight={handleHighlight}
              isLoading={isLoading}
              initialOptions={initialOptions}
            />
          </div>
        )}

        {activeTab === 'data' && (
          <div className="data-panel">
            <DataTable data={scrapedData} onHighlight={handleHighlight} config={config} />
            <ExportButton onExport={handleExport} isLoading={isLoading} status={exportStatus} />
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="presets-panel">
            <PresetsManager
              presets={presets}
              onLoad={handleLoadPreset}
              onSave={handleSavePreset}
              onDelete={handleDeletePreset}
              currentConfig={config}
            />
          </div>
        )}
      </main>
    </div>
  )
}

// Simple debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<F>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => func(...args), waitFor)
  }
}

export default SidePanel
