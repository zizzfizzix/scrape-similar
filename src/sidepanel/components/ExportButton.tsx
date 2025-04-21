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
  let buttonLabel = 'Export to Google Sheets'
  let buttonClass = 'btn btn-primary'
  let buttonDisabled = isLoading
  let onClick = onExport

  if (status) {
    if (status.success && status.url) {
      buttonLabel = 'Open Sheet \u{1F517}' // Unicode external link icon
      buttonClass = 'btn btn-primary export-ok'
      buttonDisabled = false
      onClick = () => window.open(status.url, '_blank', 'noopener,noreferrer')
    } else {
      buttonLabel = 'Error, Retry'
      buttonClass = 'btn btn-danger export-error'
      buttonDisabled = false
      onClick = onExport
    }
  }

  return (
    <button type="button" className={buttonClass} onClick={onClick} disabled={buttonDisabled}>
      {isLoading ? <span className="spinner"></span> : buttonLabel}
    </button>
  )
}

export default ExportButton
