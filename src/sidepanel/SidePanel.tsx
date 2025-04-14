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
import { STORAGE_KEYS, getPresets, savePreset, deletePreset } from '../core/storage'
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
  
  // Helper function to create default state
  const createDefaultState = (): Partial<SidePanelConfig> => {
    return {
      initialSelectionText: undefined,
      elementDetails: undefined,
      selectionOptions: undefined,
      currentScrapeConfig: undefined,
      scrapedData: [],
      exportStatus: null
    };
  };

  // Keep the ref updated whenever the state changes
  useEffect(() => {
    targetTabIdRef.current = targetTabId;
  }, [targetTabId]);

  // Request tabId from background script on mount
  useEffect(() => {
    console.log('SidePanel mounted, requesting tabId directly from chrome.tabs API...');
    
    // Use chrome.tabs API directly instead of messaging
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError.message);
      } else if (tabs && tabs[0] && tabs[0].id) {
        console.log(`Got initial tabId directly: ${tabs[0].id}`);
        const newTabId = tabs[0].id;
        
        // Update ref directly for immediate use
        targetTabIdRef.current = newTabId;
        // Also update state for component re-renders
        setTargetTabId(newTabId);
        
        // Once we have the tab ID, load data directly from storage
        const sessionKey = `sidepanel_config_${newTabId}`;
        chrome.storage.session.get(sessionKey, (result) => {
          if (chrome.runtime.lastError) {
            console.error('Error loading initial data from storage:', chrome.runtime.lastError);
            return;
          }
          
          if (result[sessionKey]) {
            console.log('Initial data loaded from storage:', result[sessionKey]);
            handleInitialData({
              tabId: newTabId,
              config: result[sessionKey]
            });
          } else {
            console.log(`No initial data found in storage for tab ${newTabId}, using default state`);
            
            // Just use default state without saving it to storage
            const defaultState = createDefaultState();
            handleInitialData({
              tabId: newTabId,
              config: defaultState
            });
          }
        });
      } else {
        console.error('No active tab found in last focused window');
      }
    });
  }, []);

  // Debounced function to save config changes directly to session storage
  const debouncedSaveConfig = useCallback(
    debounce((newConfig: ScrapeConfig, tabId: number) => {
      console.log(`Debounced save for tab ${tabId}:`, newConfig);
      const sessionKey = `sidepanel_config_${tabId}`;
      
      // Get current storage data first to merge properly
      chrome.storage.session.get(sessionKey, (result) => {
        const currentData = result[sessionKey] || {};
        
        // Update with new config
        const updatedData = { 
          ...currentData, 
          currentScrapeConfig: newConfig 
        };
        
        // Save directly to storage
        console.log(`Saving config directly to session storage:`, updatedData);
        chrome.storage.session.set({ [sessionKey]: updatedData });
      });
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
    // Only compare with targetTabIdRef if it has been set
    const currentExpectedTabId = targetTabIdRef.current;
    if (currentExpectedTabId !== null && payload.tabId !== currentExpectedTabId) {
      console.warn(`handleInitialData called for wrong tab ${payload.tabId}, expected ${currentExpectedTabId}`);
      return;
    }

    console.log(`Processing data for tab ${payload.tabId}:`, payload.config);
    const { selectionOptions, elementDetails, currentScrapeConfig, initialSelectionText, scrapedData, exportStatus } = payload.config || {}; // Default to empty object

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

    // Load saved scraped data from session storage if available
    if (scrapedData && scrapedData.length > 0) {
      console.log('Loading scraped data from session storage:', scrapedData);
      setScrapedData(scrapedData);
    } else {
      // Clear potentially stale data from previous tab
      setScrapedData([]);
    }
    
    // Handle export status if available
    if (exportStatus) {
      console.log('Setting export status from session storage:', exportStatus);
      setExportStatus(exportStatus);
    } else {
      setExportStatus(null);
    }
    
    setIsLoading(false); // Ensure loading state is reset
  }, []);

  // Initialize: load presets, listen for messages, AND listen for tab activation
  useEffect(() => {
    // Load presets from storage directly
    const loadPresets = async () => {
      try {
        // Get presets directly using the helper function
        const loadedPresets = await getPresets();
        console.log('Presets loaded directly from storage:', loadedPresets);
        setPresets(loadedPresets);
      } catch (error) {
        console.error('Error loading presets:', error);
        setPresets([]);
      }
    };
    
    loadPresets();

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
      
      // Update ref directly for immediate use
      targetTabIdRef.current = newTabId;
      // Also update state for component re-renders
      setTargetTabId(newTabId);

      // Load data directly from storage for the new tab
      const sessionKey = `sidepanel_config_${newTabId}`;
      chrome.storage.session.get(sessionKey, (result) => {
        if (chrome.runtime.lastError) {
          console.error(`Error loading data from storage for tab ${newTabId}:`, chrome.runtime.lastError);
          return;
        }
        
        if (result[sessionKey]) {
          console.log(`Data loaded from storage for newly activated tab ${newTabId}:`, result[sessionKey]);
          handleInitialData({
            tabId: newTabId,
            config: result[sessionKey]
          });
        } else {
          console.log(`No data found in storage for newly activated tab ${newTabId}, using default state`);
          
          // Just use default state without saving it to storage
          const defaultState = createDefaultState();
          handleInitialData({
            tabId: newTabId,
            config: defaultState
          });
        }
      });
    };

    // Listen for storage changes to update UI when storage is modified
    const storageChangeListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      // Handle session storage changes (tab-specific data)
      if (areaName === 'session') {
        const currentTabId = targetTabIdRef.current;
        if (currentTabId) {
          const sessionKey = `sidepanel_config_${currentTabId}`;
          
          if (changes[sessionKey]) {
            console.log(`Storage change detected for current tab ${currentTabId}:`, changes[sessionKey]);
            const newValue = changes[sessionKey].newValue;
            
            // Use the new value directly instead of making an additional request
            if (newValue) {
              console.log('Updating UI directly with storage change data:', newValue);
              
              // Pass the current tab ID from the ref to ensure consistency
              handleInitialData({
                tabId: currentTabId,
                config: newValue
              });
            }
          }
        }
      }
      
      // Handle synced storage changes (global presets)
      if (areaName === 'sync' && changes[STORAGE_KEYS.GLOBAL_PRESETS]) {
        console.log('Global presets updated in synced storage:', changes[STORAGE_KEYS.GLOBAL_PRESETS]);
        const newPresets = changes[STORAGE_KEYS.GLOBAL_PRESETS].newValue;
        if (newPresets) {
          console.log('Updating presets in UI from synced storage change');
          setPresets(newPresets);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.tabs.onActivated.addListener(tabActivationListener);
    chrome.storage.onChanged.addListener(storageChangeListener);

    // Cleanup listeners on component unmount
    return () => {
      console.log('SidePanel unmounting, removing listeners...');
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onActivated.removeListener(tabActivationListener);
      chrome.storage.onChanged.removeListener(storageChangeListener);
    };
    // Dependencies: only handleInitialData (which itself has limited/no dependencies now)
  }, [handleInitialData]);

  // Handle scrape request
  const handleScrape = () => {
    if (!targetTabId) return

    setIsLoading(true)
    
    // Send message directly to content script using chrome.tabs API
    chrome.tabs.sendMessage(targetTabId, {
      type: MESSAGE_TYPES.START_SCRAPE,
      payload: config,
    }, (response) => {
      // Reset loading state when we get a response
      console.log('Received scrape response from content script:', response);
      
      if (response?.success) {
        // The storage listener will handle updating the UI with the scraped data
        console.log('Scrape successful, storage listener will update UI.');
      } else if (response?.error) {
        console.error('Error during scrape:', response.error);
        // Consider adding error state/display
      }
      
      // Always reset loading state on response
      setIsLoading(false);
    });
  }

  // Handle highlight request
  const handleHighlight = (selector: string, language: string) => {
    if (!targetTabId) return

    // Send message directly to content script using chrome.tabs API
    chrome.tabs.sendMessage(targetTabId, {
      type: MESSAGE_TYPES.HIGHLIGHT_ELEMENTS,
      payload: {
        selector,
        language,
      },
    });
  }

  // Handle export request
  const handleExport = () => {
    setIsLoading(true)
    setExportStatus(null)

    // This operation can't be done directly by sidepanel, so we still need to message background
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPORT_TO_SHEETS,
      payload: scrapedData,
    })
  }

  // Handle CSV export
  const handleCsvExport = () => {
    if (!scrapedData.length) return;

    // Get headers from the first row
    const headers = Object.keys(scrapedData[0]);
    
    // Create CSV content
    const csvContent = [
      // Headers row - wrap each header in quotes
      headers.map(header => `"${header.replace(/"/g, '""')}"`).join(','),
      // Data rows - always wrap in quotes and escape existing quotes
      ...scrapedData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          const escapedValue = value.replace(/"/g, '""');
          return `"${escapedValue}"`;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `scraper-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Handle loading a preset
  const handleLoadPreset = (preset: Preset) => {
    // Use the config change handler to update state and save
    handleConfigChange(preset.config)
    setActiveTab('config')
  }

  // Handle saving a preset directly to storage
  const handleSavePreset = async (name: string) => {
    const preset: Preset = {
      id: Date.now().toString(),
      name,
      config,
      createdAt: Date.now(),
    }

    try {
      // Save directly to storage
      const success = await savePreset(preset);
      
      if (success) {
        // Get updated presets to refresh UI
        const updatedPresets = await getPresets();
        setPresets(updatedPresets);
        console.log('Preset saved successfully and UI updated');
      } else {
        console.error('Failed to save preset');
      }
    } catch (error) {
      console.error('Error saving preset:', error);
    }
  }

  // Handle deleting a preset directly from storage
  const handleDeletePreset = async (presetId: string) => {
    try {
      // Delete directly from storage
      const success = await deletePreset(presetId);
      
      if (success) {
        // Get updated presets to refresh UI
        const updatedPresets = await getPresets();
        setPresets(updatedPresets);
        console.log('Preset deleted successfully and UI updated');
      } else {
        console.error('Failed to delete preset');
      }
    } catch (error) {
      console.error('Error deleting preset:', error);
    }
  }

  return (
    <div className="side-panel">
      <header className="header">
        <div className="tabs">
          <button
            className={activeTab === 'config' ? 'active' : ''}
            onClick={() => setActiveTab('config')}
          >
            Configuration
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
            
            {/* Scraped Data section moved under configuration */}
            <div className="scraped-data-section">
              <h3>Scraped Data {scrapedData.length > 0 ? `(${scrapedData.length})` : ''}</h3>
              <DataTable data={scrapedData} onHighlight={handleHighlight} config={config} />
              {scrapedData.length > 0 && (
                <div className="export-buttons">
                  <ExportButton onExport={handleExport} isLoading={isLoading} status={exportStatus} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCsvExport}
                  >
                    Export CSV
                  </button>
                </div>
              )}
            </div>
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
