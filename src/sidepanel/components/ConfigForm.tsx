import React, { useEffect, useRef, useState } from 'react'
import { MESSAGE_TYPES, Preset, ScrapeConfig, SelectionOptions } from '../../core/types'
import PresetsManager from './PresetsManager'

interface ConfigFormProps {
  config: ScrapeConfig
  onChange: (config: ScrapeConfig) => void
  onScrape: () => void
  onHighlight: (selector: string) => void
  isLoading: boolean
  initialOptions: SelectionOptions | null
  presets: Preset[]
  onLoadPreset: (preset: Preset) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (presetId: string) => void
  showPresets: boolean
  setShowPresets: React.Dispatch<React.SetStateAction<boolean>>
  lastScrapeRowCount: number | null
  onClearLastScrapeRowCount?: () => void
}

const ConfigForm: React.FC<ConfigFormProps> = ({
  config,
  onChange,
  onScrape,
  onHighlight,
  isLoading,
  initialOptions,
  presets,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  showPresets,
  setShowPresets,
  lastScrapeRowCount,
  onClearLastScrapeRowCount,
}) => {
  // Local state for adding a new column
  const [newColumnName, setNewColumnName] = useState('')

  const columnsListRef = useRef<HTMLDivElement>(null)
  const prevColumnsCount = useRef(config.columns.length)
  const [shouldScrollToEnd, setShouldScrollToEnd] = useState(false)
  const [guessButtonState, setGuessButtonState] = useState<
    'idle' | 'generating' | 'success' | 'failure'
  >('idle')
  const [scrapeButtonState, setScrapeButtonState] = useState<'idle' | 'zero-found'>('idle')
  const zeroFoundTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (shouldScrollToEnd && config.columns.length > prevColumnsCount.current) {
      if (columnsListRef.current) {
        columnsListRef.current.scrollTo({
          left: columnsListRef.current.scrollWidth,
          behavior: 'smooth',
        })
      }
      setShouldScrollToEnd(false)
    }
    prevColumnsCount.current = config.columns.length
  }, [config.columns.length, shouldScrollToEnd])

  // Watch for lastScrapeRowCount changes
  useEffect(() => {
    if (typeof lastScrapeRowCount === 'number') {
      if (lastScrapeRowCount === 0) {
        setScrapeButtonState('zero-found')
        if (zeroFoundTimeoutRef.current) clearTimeout(zeroFoundTimeoutRef.current)
        zeroFoundTimeoutRef.current = setTimeout(() => {
          setScrapeButtonState('idle')
          if (onClearLastScrapeRowCount) onClearLastScrapeRowCount()
        }, 1500)
      } else {
        setScrapeButtonState('idle')
        if (onClearLastScrapeRowCount) onClearLastScrapeRowCount()
      }
    }
    return () => {
      if (zeroFoundTimeoutRef.current) clearTimeout(zeroFoundTimeoutRef.current)
    }
  }, [lastScrapeRowCount, onClearLastScrapeRowCount])

  // Handle main selector change
  const handleMainSelectorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      mainSelector: e.target.value,
    })
  }

  // Handle column name change
  const handleColumnNameChange = (index: number, value: string) => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], name: value }
    onChange({
      ...config,
      columns: newColumns,
    })
  }

  // Handle column selector change
  const handleColumnSelectorChange = (index: number, value: string) => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], selector: value }
    onChange({
      ...config,
      columns: newColumns,
    })
  }

  // Add a new column
  const addColumn = () => {
    if (!newColumnName.trim()) return

    onChange({
      ...config,
      columns: [...config.columns, { name: newColumnName, selector: '.' }],
    })

    setNewColumnName('')
  }

  // Remove a column
  const removeColumn = (index: number) => {
    onChange({
      ...config,
      columns: config.columns.filter((_, i) => i !== index),
    })
  }

  // Handler to guess config from selector
  const handleGuessConfig = async () => {
    if (!config.mainSelector) return
    setGuessButtonState('generating')
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab?.id) {
          setGuessButtonState('failure')
          setTimeout(() => setGuessButtonState('idle'), 1500)
          return
        }
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: MESSAGE_TYPES.GUESS_CONFIG_FROM_SELECTOR,
            payload: { mainSelector: config.mainSelector },
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
    } catch (err) {
      setGuessButtonState('failure')
      setTimeout(() => setGuessButtonState('idle'), 1500)
    }
  }

  return (
    <div className="config-form">
      <div className="form-group">
        <label htmlFor="mainSelector">Main Selector</label>
        <p className="form-help">This selector identifies the main elements to scrape.</p>
        <div className="selector-input-group">
          <input
            type="text"
            id="mainSelector"
            value={config.mainSelector}
            onChange={handleMainSelectorChange}
            onBlur={() => {
              if (config.mainSelector) {
                onHighlight(config.mainSelector)
              }
            }}
            placeholder="Enter XPath selector"
          />
        </div>

        {initialOptions?.previewData && initialOptions.previewData.length > 0 && (
          <div className="preview-box">
            <h4>Selection preview:</h4>
            <ul>
              {initialOptions.previewData.map((item, index) => (
                <li key={index}>
                  {item.text.substring(0, 100)}
                  {item.text.length > 100 ? '...' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Columns</label>
        <p className="form-help">
          Define what data to extract from each main element. Use "." to get the text content of the
          element itself, or "@attr" to get an attribute.
        </p>
        <div className="columns-row">
          <div className="columns-list" ref={columnsListRef}>
            {config.columns.map((column, index) => (
              <div key={index} className="column-item">
                <input
                  type="text"
                  value={column.name}
                  onChange={(e) => handleColumnNameChange(index, e.target.value)}
                  placeholder="Column name"
                />
                <input
                  type="text"
                  value={column.selector}
                  onChange={(e) => handleColumnSelectorChange(index, e.target.value)}
                  placeholder="Selector"
                />
                <div className="column-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeColumn(index)}
                    disabled={config.columns.length <= 1}
                    title="Remove column"
                  >
                    ❌
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="add-column">
            <button
              type="button"
              className={`btn btn-primary${guessButtonState === 'success' ? ' btn-success' : ''}${guessButtonState === 'failure' ? ' btn-failure' : ''}`}
              onClick={handleGuessConfig}
              disabled={guessButtonState === 'generating' || !config.mainSelector}
              title="Auto-generate configuration from selector"
            >
              {guessButtonState === 'generating' ? (
                <span className="spinner"></span>
              ) : guessButtonState === 'success' ? (
                '✔️'
              ) : guessButtonState === 'failure' ? (
                '❌'
              ) : (
                '🪄'
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const defaultName = `Column ${config.columns.length + 1}`
                onChange({
                  ...config,
                  columns: [...config.columns, { name: defaultName, selector: '.' }],
                })
                setShouldScrollToEnd(true)
              }}
              title="Add column"
            >
              ➕
            </button>
          </div>
        </div>
      </div>

      {/* Presets Accordion */}
      <div className="form-group">
        <button
          type="button"
          className="btn btn-secondary accordion-button"
          onClick={() => setShowPresets((prev) => !prev)}
          aria-expanded={showPresets}
          aria-controls="presets-panel"
        >
          Presets
          <span>{showPresets ? '▼' : '▶'}</span>
        </button>
        {showPresets && (
          <div className="presets-panel">
            <PresetsManager
              presets={presets}
              onLoad={onLoadPreset}
              onSave={onSavePreset}
              onDelete={onDeletePreset}
              currentConfig={config}
            />
          </div>
        )}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onScrape}
          disabled={isLoading || !config.mainSelector || config.columns.length === 0}
        >
          {isLoading ? (
            <span className="spinner"></span>
          ) : scrapeButtonState === 'zero-found' ? (
            '0 found'
          ) : (
            'Scrape ▶'
          )}
        </button>
      </div>
    </div>
  )
}

export default ConfigForm
