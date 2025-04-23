import { author } from '@/../package.json'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { ModeToggle } from '@/components/ui/mode-toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Clipboard, Cog } from 'lucide-react'
import * as React from 'react'
import { useCallback } from 'react'

interface FooterProps {
  className?: string
  onResetSystemPresets?: () => void
}

export const Footer: React.FC<FooterProps> = ({ className, onResetSystemPresets }) => {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)

  return (
    <footer
      className={`sticky bottom-0 left-0 w-full z-40 bg-background border-t border-border flex items-center justify-between px-4 h-12 text-sm font-medium text-muted-foreground ${className || ''}`}
      data-slot="footer"
    >
      <span>
        Made by{' '}
        <a
          className="underline hover:text-primary"
          href="https://www.linkedin.com/in/kubaserafinowski/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {author}
        </a>
      </span>
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Settings">
                <Cog className="size-5" />
              </Button>
            </DrawerTrigger>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <DrawerContent className="w-full right-0 fixed border-l bg-background shadow-lg flex flex-col h-autorounded-lg">
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 p-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Theme</span>
                <ModeToggle />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Keyboard shortcut</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      aria-label="Go to Chrome shortcut settings"
                      onClick={useCallback(() => {
                        const url = 'chrome://extensions/shortcuts#:~:text=Scrape%20Similar'
                        navigator.clipboard.writeText(url)
                        window.open('about:blank', '_blank')
                      }, [])}
                    >
                      <Clipboard className="size-4 ml-1" />
                      Copy address
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Paste in a new tab to open settings</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">System presets</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetSystemPresets}
                  aria-label="Reset system presets"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
          <DrawerFooter>
            <div className="text-xs text-muted-foreground text-center w-full">
              Inspired by the legacy{' '}
              <a
                href="https://github.com/mnmldave/scraper"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Scraper
              </a>{' '}
              extension
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </footer>
  )
}
