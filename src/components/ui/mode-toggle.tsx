import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANALYTICS_EVENTS, trackEvent } from '@/utils/analytics'

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
