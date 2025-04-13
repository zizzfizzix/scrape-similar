import React, { useState } from 'react'
import { ColumnDefinition, ScrapeConfig, SelectionOptions } from '../../core/types'

interface ConfigFormProps {
  config: ScrapeConfig
  onChange: (config: ScrapeConfig) => void
  onScrape: () => void
  onHighlight: (selector: string, language: string) => void
  isLoading: boolean
  initialOptions: SelectionOptions | null
}

const ConfigForm: React.FC<ConfigFormProps> = ({
  config,
  onChange,
  onScrape,
  onHighlight,
  isLoading,
  initialOptions,
}) => {
  // Local state for adding a new column
  const [newColumnName, setNewColumnName] = useState('')

  // Handle main selector change
  const handleMainSelectorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...config,
      mainSelector: e.target.value,
    })
  }

  // Handle language change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...config,
      language: e.target.value as 'xpath' | 'css',
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

  // Handle column language change
  const handleColumnLanguageChange = (index: number, value: 'xpath' | 'css') => {
    const newColumns = [...config.columns]
    newColumns[index] = { ...newColumns[index], language: value }
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
      columns: [...config.columns, { name: newColumnName, selector: '.', language: 'xpath' }],
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

  // Test main selector (highlight matching elements)
  const testSelector = () => {
    onHighlight(config.mainSelector, config.language)
  }

  return (
    <div className="config-form">
      <div className="form-group">
        <label htmlFor="mainSelector">Main Selector:</label>
        <div className="selector-input-group">
          <input
            type="text"
            id="mainSelector"
            value={config.mainSelector}
            onChange={handleMainSelectorChange}
            placeholder="Enter XPath or CSS selector"
          />
          <select
            value={config.language}
            onChange={handleLanguageChange}
            aria-label="Selector language"
          >
            <option value="xpath">XPath</option>
            <option value="css">CSS</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={testSelector}
            disabled={!config.mainSelector}
          >
            Test
          </button>
        </div>
        <p className="form-help">This selector identifies the main elements to scrape.</p>

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
        <label>Columns:</label>
        <div className="columns-list">
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
              <select
                value={column.language}
                onChange={(e) =>
                  handleColumnLanguageChange(index, e.target.value as 'xpath' | 'css')
                }
                aria-label="Column selector language"
              >
                <option value="xpath">XPath</option>
                <option value="css">CSS</option>
              </select>
              <div className="column-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onHighlight(column.selector, column.language)}
                  disabled={!column.selector}
                  title="Test selector"
                >
                  🔍
                </button>
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

          <div className="add-column">
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="New column name"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={addColumn}
              disabled={!newColumnName.trim()}
            >
              Add Column
            </button>
          </div>
        </div>
        <p className="form-help">
          Define what data to extract from each main element. Use "." to get the text content of the
          element itself, or "@attr" to get an attribute.
        </p>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onScrape}
          disabled={isLoading || !config.mainSelector || config.columns.length === 0}
        >
          {isLoading ? <span className="spinner"></span> : null}
          Scrape Data
        </button>
      </div>
    </div>
  )
}

export default ConfigForm
