import React from 'react'

interface ExportStatus {
  success?: boolean
  url?: string
  error?: string
}

interface ExportButtonProps {
  onExport: () => void
  isLoading: boolean
  status: ExportStatus | null
}

const ExportButton: React.FC<ExportButtonProps> = ({ onExport, isLoading, status }) => {
  return (
    <div className="export-section">
      <button type="button" className="btn btn-primary" onClick={onExport} disabled={isLoading}>
        {isLoading ? <span className="spinner"></span> : null}
        Export to Google Sheets
      </button>

      {status && (
        <div className={`export-status ${status.success ? 'success' : 'error'}`}>
          {status.success ? (
            <>
              <p>✅ Data successfully exported to Google Sheets!</p>
              {status.url && (
                <p>
                  <a href={status.url} target="_blank" rel="noopener noreferrer">
                    Open spreadsheet
                  </a>
                </p>
              )}
            </>
          ) : (
            <p>❌ Error exporting data: {status.error || 'Unknown error'}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default ExportButton
