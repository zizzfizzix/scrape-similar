import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ANALYTICS_EVENTS, trackEvent } from '@/core/analytics'

export function ModeToggle() {
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
        <Button variant="outline" size="sm" className="justify-between">
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
