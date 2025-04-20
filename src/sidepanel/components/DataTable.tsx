import React from 'react'
import { ScrapedData, ScrapeConfig } from '../../core/types'

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onHighlight: (selector: string, language: string) => void
}

const DataTable: React.FC<DataTableProps> = ({ data, config, onHighlight }) => {

  // Get column headers from first row
  const columns = Object.keys(data[0])

  // Highlight a row by using the main selector with index
  const handleHighlightRow = (rowIndex: number) => {
    // This is a simplified approach - in a real implementation, we might
    // need to track the actual DOM elements corresponding to each row
    if (config.language === 'xpath') {
      // For XPath, we add position filtering
      const rowSelector = `(${config.mainSelector})[${rowIndex + 1}]`
      onHighlight(rowSelector, 'xpath')
    } else {
      // For CSS, we add :nth-child if possible
      onHighlight(`${config.mainSelector}:nth-child(${rowIndex + 1})`, 'css')
    }
  }

  return (
    <div className="data-table-container">
      <div className="table-stats">
        <span>{data.length} row(s) found</span>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-index">#</th>
              {columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-index">{rowIndex + 1}</td>
                {columns.map((column, colIndex) => (
                  <td key={colIndex} title={row[column]}>
                    {row[column].length > 100 ? `${row[column].substring(0, 100)}...` : row[column]}
                  </td>
                ))}
                <td className="actions-column">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleHighlightRow(rowIndex)}
                    title="Highlight this element"
                  >
                    🔍
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DataTable
