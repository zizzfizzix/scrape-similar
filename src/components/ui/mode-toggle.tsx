import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import * as React from 'react'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  // Sync with chrome.storage.sync
  const handleSetTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme)
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({ theme: newTheme })
    }
  }

  React.useEffect(() => {
    // On mount, try to load theme from chrome.storage.sync
    if (chrome?.storage?.sync) {
      chrome.storage.sync.get(['theme'], (result) => {
        if (result.theme && ['light', 'dark', 'system'].includes(result.theme)) {
          setTheme(result.theme)
        }
      })
    }
  }, [])

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[90px] justify-between">
          {themeLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSetTheme('light')}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme('dark')}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme('system')}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
