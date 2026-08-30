import '@/assets/tailwind.css'
import { Logo } from '@/components/Logo'
import { ThemeProvider } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { XIcon } from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'

interface PickerBannerProps {
  count: number
  xpath: string
  onClose: () => void
}

export const PickerBanner: React.FC<PickerBannerProps> = ({ count, xpath, onClose }) => {
  return (
    <div className="fixed inset-x-0 top-0 z-2147483646 pointer-events-auto bg-background border-b flex items-center justify-center gap-3 px-4 py-2 text-foreground text-sm font-sans">
      <div className="inline-flex items-center gap-2 font-semibold">
        <Logo />
      </div>
      <Badge variant="secondary" className="min-w-10 h-6 px-2 flex items-center justify-center">
        {count}
      </Badge>
      <Input
        className="flex-1 min-w-44 max-w-[40vw] focus-visible:ring-0 focus-visible:ring-offset-0 cursor-default"
        placeholder="Hover over the page to select elements"
        value={xpath}
        readOnly
        disabled
        tabIndex={-1}
      />
      <div className="inline-flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          title="Close picker"
          aria-label="Close picker"
          onClick={onClose}
        >
          <XIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export function mountPickerBannerReact(
  container: HTMLElement,
  handlers: {
    getState: () => { count: number; xpath: string }
    onClose: () => void
  },
  themeRoot?: Element,
): { unmount: () => void; setData: (count: number, xpath: string) => void; ready: Promise<void> } {
  const root = ReactDOM.createRoot(container)

  // Promise that resolves when the React component has mounted
  let resolveReady: () => void
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  function BannerWrapper({ count, xpath }: { count: number; xpath: string }) {
    // Signal that the component is ready after the first render
    React.useEffect(() => {
      resolveReady()
    }, [])

    return (
      <ThemeProvider rootElement={themeRoot || container}>
        <PickerBanner count={count} xpath={xpath} onClose={handlers.onClose} />
      </ThemeProvider>
    )
  }

  // The picker drives the banner from outside React, so an update is a re-render
  // of the root with new props rather than a setter stashed on the container —
  // which the wrapper had to write during render, and which did not exist until
  // React had committed.
  const paint = (count: number, xpath: string) => {
    root.render(<BannerWrapper count={count} xpath={xpath} />)
  }

  const initial = handlers.getState()
  paint(initial.count, initial.xpath)

  let isMounted = true

  return {
    unmount: () => {
      isMounted = false
      root.unmount()
    },
    setData: (count, xpath) => {
      if (isMounted) paint(count, xpath)
    },
    ready: readyPromise,
  }
}
