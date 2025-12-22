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
    <div className="fixed inset-x-0 top-0 z-[2147483646] pointer-events-none bg-background border-b">
      <div className="pointer-events-auto mx-auto my-0 flex items-center gap-3 px-4 py-2 text-foreground text-sm font-sans min-w-[25vw] max-w-[50vw]">
        <div className="inline-flex items-center gap-2 font-semibold">
          <Logo />
        </div>
        <Badge variant="secondary" className="min-w-10 h-6 px-2 flex items-center justify-center">
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

  function BannerWrapper() {
    const [count, setCount] = React.useState<number>(handlers.getState().count)
    const [xpath, setXpath] = React.useState<string>(handlers.getState().xpath)

    // Set the data setter on the container so it can be called externally
    ;(container as any).__setData = (c: number, x: string) => {
      setCount(c)
      setXpath(x)
    }

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

  root.render(<BannerWrapper />)

  return {
    unmount: () => root.unmount(),
    setData: (c, x) => {
      const setter = (container as any).__setData
      if (typeof setter === 'function') setter(c, x)
    },
    ready: readyPromise,
  }
}
