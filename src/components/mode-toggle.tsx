import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'
import { ChevronsUpDown, Moon, Sun, SunMoon } from 'lucide-react'

interface ModeToggleProps {
  /** id passed to the underlying button for accessibility purposes */
  id?: string
  /** Accessibility label reference describing the toggle purpose */
  ariaLabelledby?: string
}

export function ModeToggle({ id, ariaLabelledby }: ModeToggleProps) {
  const { theme, setTheme } = useTheme()

  // Handle theme change with analytics tracking
  const handleSetTheme = (newTheme: 'light' | 'dark' | 'system') => {
    const previousTheme = theme
    setTheme(newTheme)

    // Track theme change (only if it's actually different)
    if (previousTheme !== newTheme) {
      trackEvent(ANALYTICS_EVENTS.THEME_CHANGE, {
        from_theme: previousTheme,
        to_theme: newTheme,
      })
    }
  }

  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          aria-labelledby={ariaLabelledby}
          variant="outline"
          size="sm"
          className="justify-between"
        >
          {theme === 'light' ? (
            <Sun className="mr-1" />
          ) : theme === 'dark' ? (
            <Moon className="mr-1" />
          ) : (
            <SunMoon className="mr-1" />
          )}
          {themeLabel} <ChevronsUpDown className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSetTheme('light')}>
          <Sun className="mr-1" /> <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme('dark')}>
          <Moon className="mr-1" /> <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme('system')}>
          <SunMoon className="mr-1" /> <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
