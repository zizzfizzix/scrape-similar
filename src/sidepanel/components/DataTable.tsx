import React from 'react'
import { ScrapeConfig, ScrapedData } from '../../core/types'

interface DataTableProps {
  data: ScrapedData
  config: ScrapeConfig
  onHighlight: (selector: string) => void
  columnOrder?: string[]
}

const DataTable: React.FC<DataTableProps> = ({ data, config, onHighlight, columnOrder }) => {
  // Use columnOrder if provided, otherwise fallback to config.columns order
  const columns =
    columnOrder && columnOrder.length > 0 ? columnOrder : config.columns.map((col) => col.name)

  // Highlight a row by using the main selector with index
  const handleHighlightRow = (rowIndex: number) => {
    const rowSelector = `(${config.mainSelector})[${rowIndex + 1}]`
    onHighlight(rowSelector)
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
