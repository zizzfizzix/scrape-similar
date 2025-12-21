import '@/assets/tailwind.css'
import { ThemeProvider } from '@/components/theme-provider'
import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'

interface PickerContextMenuProps {
  x: number
  y: number
  levels: number
  currentLevel: number
  onChange: (level: number) => void
  onClose: () => void
}

export const PickerContextMenu: React.FC<PickerContextMenuProps> = ({
  x,
  y,
  levels,
  currentLevel,
  onChange,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)

  // Calculate position to keep menu on screen
  const menuWidth = 80
  const menuHeight = 200
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8)
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8)
  const finalX = Math.max(8, adjustedX)
  const finalY = Math.max(8, adjustedY)

  // Update indicator position and width based on current level
  const updateIndicator = () => {
    if (!indicatorRef.current) return
    const maxIndex = Math.max(0, levels - 1)
    const percent = maxIndex > 0 ? currentLevel / maxIndex : 0

    // Position: 0% = bottom, 100% = top
    const trackHeight = 120
    const indicatorHeight = 6
    const bottom = percent * (trackHeight - indicatorHeight)
    indicatorRef.current.style.bottom = `${bottom}px`

    // Width matches the tapered track
    const bottomWidth = 25
    const topWidth = 40
    const width = bottomWidth + percent * (topWidth - bottomWidth)
    indicatorRef.current.style.width = `${width}px`
  }

  useEffect(() => {
    updateIndicator()
  }, [currentLevel, levels])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    onChange(value)
  }

  // SVG mask for tapered track (wider at top, narrower at bottom)
  const trackMaskSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 120' preserveAspectRatio='none'%3E%3Cpath d='M3 0 L37 0 Q40 0 40 3 L32.5 117 Q32.5 120 29.5 120 L10.5 120 Q7.5 120 7.5 117 L0 3 Q0 0 3 0 Z' fill='black'/%3E%3C/svg%3E")`

  return (
    <div
      ref={menuRef}
      className="fixed z-[2147483647] rounded-lg border bg-popover text-popover-foreground shadow-md p-3"
      style={{
        left: `${finalX}px`,
        top: `${finalY}px`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center gap-1.5">
        {/* Top label - Broad */}
        <span className="text-[11px] text-muted-foreground">Broad</span>

        {/* Slider wrapper */}
        <div className="relative h-[120px] w-[40px] flex items-center justify-center">
          {/* Visual tapered track */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-muted pointer-events-none"
            style={{
              WebkitMask: trackMaskSvg,
              mask: trackMaskSvg,
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
            }}
          />

          {/* Custom indicator */}
          <div
            ref={indicatorRef}
            className="absolute left-1/2 -translate-x-1/2 h-1.5 rounded-sm bg-primary pointer-events-none shadow-md transition-all duration-100 ease-out"
            style={{ bottom: 0, width: 25 }}
          />

          {/* Hidden range input for interaction */}
          <input
            ref={sliderRef}
            type="range"
            min="0"
            max={Math.max(0, levels - 1)}
            value={currentLevel}
            onChange={handleSliderChange}
            className="absolute w-[120px] h-[40px] bg-transparent outline-none cursor-pointer z-10 appearance-none"
            style={{
              transform: 'rotate(-90deg)',
              WebkitAppearance: 'none',
            }}
          />
        </div>

        {/* Bottom label - Specific */}
        <span className="text-[11px] text-muted-foreground">Specific</span>

        {/* Level info */}
        <span className="text-[11px] text-muted-foreground mt-0.5">
          Level {levels - currentLevel} of {levels}
        </span>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 40px;
          background: transparent;
          cursor: pointer;
          border: none;
        }
        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 40px;
          background: transparent;
          cursor: pointer;
          border: none;
        }
        input[type="range"]::-webkit-slider-runnable-track {
          background: transparent;
          height: 40px;
        }
        input[type="range"]::-moz-range-track {
          background: transparent;
          height: 40px;
        }
      `}</style>
    </div>
  )
}

interface MountContextMenuOptions {
  x: number
  y: number
  levels: number
  currentLevel: number
  onChange: (level: number) => void
  onClose: () => void
}

export function mountPickerContextMenuReact(
  container: HTMLElement,
  options: MountContextMenuOptions,
  themeRoot?: Element,
): {
  unmount: () => void
  updateLevel: (level: number) => void
  updateLevels: (levels: number, currentLevel: number) => void
  updatePosition: (x: number, y: number) => void
} {
  const root = ReactDOM.createRoot(container)

  let currentState = {
    levels: options.levels,
    currentLevel: options.currentLevel,
    x: options.x,
    y: options.y,
  }

  function ContextMenuWrapper() {
    const [levels, setLevels] = React.useState(currentState.levels)
    const [currentLevel, setCurrentLevel] = React.useState(currentState.currentLevel)
    const [position, setPosition] = React.useState({ x: currentState.x, y: currentState.y })

    // Expose setters for external updates
    ;(container as any).__updateLevel = (level: number) => {
      setCurrentLevel(level)
      currentState.currentLevel = level
    }
    ;(container as any).__updateLevels = (l: number, cl: number) => {
      setLevels(l)
      setCurrentLevel(cl)
      currentState.levels = l
      currentState.currentLevel = cl
    }
    ;(container as any).__updatePosition = (x: number, y: number) => {
      setPosition({ x, y })
      currentState.x = x
      currentState.y = y
    }

    const handleChange = (level: number) => {
      setCurrentLevel(level)
      currentState.currentLevel = level
      options.onChange(level)
    }

    return (
      <ThemeProvider rootElement={themeRoot || container}>
        <PickerContextMenu
          x={position.x}
          y={position.y}
          levels={levels}
          currentLevel={currentLevel}
          onChange={handleChange}
          onClose={options.onClose}
        />
      </ThemeProvider>
    )
  }

  root.render(<ContextMenuWrapper />)

  return {
    unmount: () => root.unmount(),
    updateLevel: (level: number) => {
      const setter = (container as any).__updateLevel
      if (typeof setter === 'function') setter(level)
    },
    updateLevels: (levels: number, currentLevel: number) => {
      const setter = (container as any).__updateLevels
      if (typeof setter === 'function') setter(levels, currentLevel)
    },
    updatePosition: (x: number, y: number) => {
      const setter = (container as any).__updatePosition
      if (typeof setter === 'function') setter(x, y)
    },
  }
}
