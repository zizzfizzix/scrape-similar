import React, { useState } from 'react'
import { Preset, ScrapeConfig } from '../../core/types'

interface PresetsManagerProps {
  presets: Preset[]
  onLoad: (preset: Preset) => void
  onSave: (name: string) => void
  onDelete: (presetId: string) => void
  currentConfig: ScrapeConfig
}

const PresetsManager: React.FC<PresetsManagerProps> = ({
  presets,
  onLoad,
  onSave,
  onDelete,
  currentConfig,
}) => {
  const [newPresetName, setNewPresetName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Handle saving a new preset
  const handleSave = () => {
    if (!newPresetName.trim()) return

    onSave(newPresetName.trim())
    setNewPresetName('')
  }

  // Format date
  const formatDate = (timestamp: number) => {
    return (
      new Date(timestamp).toLocaleDateString() +
      ' ' +
      new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  // Handle delete confirmation
  const handleDeleteClick = (presetId: string) => {
    if (confirmDelete === presetId) {
      // Confirmed delete
      onDelete(presetId)
      setConfirmDelete(null)
    } else {
      // Request confirmation
      setConfirmDelete(presetId)
    }
  }

  // Reset confirmation when clicked elsewhere
  const handleOutsideClick = () => {
    setConfirmDelete(null)
  }

  return (
    <div className="presets-manager" onClick={handleOutsideClick}>
      <div className="form-group" onClick={(e) => e.stopPropagation()}>
        <label htmlFor="presetName">Save Current Configuration</label>
        <div className="preset-save-form">
          <input
            type="text"
            id="presetName"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Enter preset name"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={
              !newPresetName.trim() ||
              !currentConfig.mainSelector ||
              currentConfig.columns.length === 0
            }
          >
            Save Preset
          </button>
        </div>
      </div>

      <div className="presets-list">
        <label>Saved Presets</label>

        {presets.length === 0 ? (
          <div className="no-presets">No presets saved yet.</div>
        ) : (
          presets.map((preset) => (
            <div key={preset.id} className="preset-item" onClick={(e) => e.stopPropagation()}>
              <div className="preset-details">
                <div className="preset-header">
                  <span className="preset-title">{preset.name}</span>
                  <span className="preset-meta">{formatDate(preset.createdAt)}</span>
                </div>
                <div className="preset-info">
                  <div>
                    Main selector: <code>{preset.config.mainSelector}</code>
                  </div>
                  <div>Columns: {preset.config.columns.length}</div>
                </div>
              </div>
              <div className="preset-actions">
                <button type="button" className="btn btn-secondary" onClick={() => onLoad(preset)}>
                  Load
                </button>
                <button
                  type="button"
                  className={confirmDelete === preset.id ? 'btn btn-danger' : 'btn btn-secondary'}
                  onClick={() => handleDeleteClick(preset.id)}
                >
                  {confirmDelete === preset.id ? 'Confirm' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default PresetsManager
