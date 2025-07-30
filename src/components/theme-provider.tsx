import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  themeStorageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  themeStorageKey = 'theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  // Load theme from storage on mount
  useEffect(() => {
    storage.getItem<Theme>(`local:${themeStorageKey}`).then((stored) => {
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        setTheme(stored)
      }
    })
  }, [])

  // Listen for theme changes in storage
  useEffect(() => {
    const unwatchTheme = storage.watch<Theme>(`local:${themeStorageKey}`, (newTheme) => {
      if (newTheme && ['light', 'dark', 'system'].includes(newTheme)) {
        setTheme(newTheme)
      }
    })
    return () => {
      unwatchTheme()
    }
  }, [])

  // Listen for system theme changes if theme is "system"
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light'
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(systemTheme)
    }

    mediaQuery.addEventListener('change', handleChange)
    // Set initial theme
    handleChange()

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  // Apply theme when theme changes (except for "system", which is handled above)
  useEffect(() => {
    if (theme === 'system') return
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      storage.setItem(`local:${themeStorageKey}`, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
