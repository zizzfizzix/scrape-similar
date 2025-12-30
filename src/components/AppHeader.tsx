import React from 'react'

interface AppHeaderProps {
  left?: React.ReactNode
  center?: React.ReactNode
  right?: React.ReactNode
  progressBar?: React.ReactNode
}

export const AppHeader: React.FC<AppHeaderProps> = ({ left, center, right, progressBar }) => {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
          {/* Left slot */}
          {left && <div className="flex items-center col-start-1">{left}</div>}

          {/* Center slot */}
          {center && <div className="flex items-center justify-center col-start-2">{center}</div>}

          {/* Right slot */}
          {right && <div className="flex items-center justify-end gap-3 col-start-3">{right}</div>}
        </div>
      </div>

      {/* Optional progress bar inset at bottom */}
      {progressBar && <div className="absolute bottom-0 left-0 right-0">{progressBar}</div>}
    </header>
  )
}
