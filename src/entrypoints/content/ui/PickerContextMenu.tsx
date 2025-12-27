import '@/assets/tailwind.css'
import { ThemeProvider } from '@/components/theme-provider'
import React from 'react'
import ReactDOM from 'react-dom/client'

// Menu dimensions for screen-edge clamping (px required for window dimension comparisons)
const MENU_WIDTH = 80
const MENU_HEIGHT = 208
const PADDING = 8

// SVG mask for tapered track (wider at top, narrower at bottom)
const TRACK_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 128' preserveAspectRatio='none'%3E%3Cpath d='M3 0 L37 0 Q40 0 40 3 L32.5 125 Q32.5 128 29.5 128 L10.5 128 Q7.5 128 7.5 125 L0 3 Q0 0 3 0 Z' fill='black'/%3E%3C/svg%3E")`

interface PickerContextMenuProps {
  x: number
  y: number
  levels: number
  currentLevel: number
  onChange: (level: number) => void
}

export function PickerContextMenu({
  x,
  y,
  levels,
  currentLevel,
  onChange,
}: PickerContextMenuProps) {
  // Clamp position to keep menu on screen
  const left = Math.max(PADDING, Math.min(x, window.innerWidth - MENU_WIDTH - PADDING))
  const top = Math.max(PADDING, Math.min(y, window.innerHeight - MENU_HEIGHT - PADDING))

  // Slider percentage (0-1) for CSS custom property
  const maxIndex = Math.max(0, levels - 1)
  const percent = maxIndex > 0 ? currentLevel / maxIndex : 0

  return (
    <div
      className="fixed z-2147483647 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Broad</span>

        <div
          className="relative flex h-32 w-10 items-center justify-center"
          style={{ '--percent': percent } as React.CSSProperties}
        >
          {/* Tapered track background */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 size-full -translate-x-1/2 bg-muted mask-size-[100%_100%] [mask:var(--mask)] [-webkit-mask-size:100%_100%] [-webkit-mask:var(--mask)]"
            style={{ '--mask': TRACK_MASK } as React.CSSProperties}
          />

          {/* Indicator - CSS calc() driven by --percent */}
          <div className="pointer-events-none absolute left-1/2 h-1.5 -translate-x-1/2 rounded-sm bg-primary shadow-md transition-all duration-100 ease-out bottom-[calc(var(--percent)*7.625rem)] width-[calc(1.5rem+var(--percent)*1rem)]" />

          {/* Range input (invisible, handles interaction) */}
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={currentLevel}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="absolute z-10 h-10 w-32 -rotate-90 cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:h-10 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-transparent [&::-moz-range-track]:h-10 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-10 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-none [&::-webkit-slider-thumb]:bg-transparent"
          />
        </div>

        <span className="text-xs text-muted-foreground">Specific</span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          Level {levels - currentLevel} of {levels}
        </span>
      </div>
    </div>
  )
}

interface MountOptions extends PickerContextMenuProps {
  onClose: () => void
}

export function mountPickerContextMenuReact(
  container: HTMLElement,
  options: MountOptions,
  themeRoot?: Element,
) {
  const root = ReactDOM.createRoot(container)

  // Mutable state that persists across re-renders
  const state = {
    levels: options.levels,
    currentLevel: options.currentLevel,
    x: options.x,
    y: options.y,
  }

  function Wrapper() {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

    // Expose update methods on container for external control
    React.useEffect(() => {
      const el = container as any
      el.__update = (updates: Partial<typeof state>) => {
        Object.assign(state, updates)
        forceUpdate()
      }
      return () => {
        delete el.__update
      }
    }, [])

    return (
      <ThemeProvider rootElement={themeRoot || container}>
        <PickerContextMenu
          x={state.x}
          y={state.y}
          levels={state.levels}
          currentLevel={state.currentLevel}
          onChange={(level) => {
            state.currentLevel = level
            forceUpdate()
            options.onChange(level)
          }}
        />
      </ThemeProvider>
    )
  }

  root.render(<Wrapper />)

  const update = (updates: Partial<typeof state>) => {
    const fn = (container as any).__update
    if (fn) fn(updates)
  }

  return {
    unmount: () => root.unmount(),
    updateLevel: (currentLevel: number) => update({ currentLevel }),
    updateLevels: (levels: number, currentLevel: number) => update({ levels, currentLevel }),
    updatePosition: (x: number, y: number) => update({ x, y }),
  }
}
