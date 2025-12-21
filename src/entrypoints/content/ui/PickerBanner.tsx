import '@/assets/tailwind.css'
import { Logo } from '@/components/Logo'
import { ThemeProvider } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, XIcon } from 'lucide-react'
import React from 'react'
import ReactDOM from 'react-dom/client'

interface PickerBannerProps {
  count: number
  xpath: string
  onUp: () => void
  onDown: () => void
  onClose: () => void
}

export const PickerBanner: React.FC<PickerBannerProps> = ({
  count,
  xpath,
  onUp,
  onDown,
  onClose,
}) => {
  return (
    <div className="fixed inset-x-0 top-0 z-[2147483646] pointer-events-none bg-background border-b">
      <div className="pointer-events-auto mx-auto my-0 flex items-center gap-3 px-4 py-2 text-foreground text-sm font-sans min-w-[25vw] max-w-[50vw]">
        <div className="inline-flex items-center gap-2 font-semibold">
          <Logo />
        </div>
        <Badge variant="secondary" className="min-w-6 h-6 px-2 flex items-center justify-center">
          {count}
        </Badge>
        <Input
          className="flex-1 min-w-44 focus-visible:ring-0 focus-visible:ring-offset-0"
          value={xpath}
          readOnly
        />
        <div className="inline-flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            title="More specific (Up)"
            aria-label="More specific"
            onClick={onUp}
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Less specific (Down)"
            aria-label="Less specific"
            onClick={onDown}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
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
    </div>
  )
}

export function mountPickerBannerReact(
  container: HTMLElement,
  handlers: {
    getState: () => { count: number; xpath: string }
    onUp: () => void
    onDown: () => void
    onClose: () => void
  },
  themeRoot?: Element,
): { unmount: () => void; setData: (count: number, xpath: string) => void } {
  const root = ReactDOM.createRoot(container)

  function BannerWrapper() {
    const [count, setCount] = React.useState<number>(handlers.getState().count)
    const [xpath, setXpath] = React.useState<string>(handlers.getState().xpath)

    ;(container as any).__setData = (c: number, x: string) => {
      setCount(c)
      setXpath(x)
    }

    return (
      <ThemeProvider rootElement={themeRoot || container}>
        <PickerBanner
          count={count}
          xpath={xpath}
          onUp={handlers.onUp}
          onDown={handlers.onDown}
          onClose={handlers.onClose}
        />
      </ThemeProvider>
    )
  }

  root.render(<BannerWrapper />)

  return {
    unmount: () => root.unmount(),
    setData: (c, x) => {
      const setter = (container as any).__setData
      if (typeof setter === 'function') setter(c, x)
    },
  }
}
