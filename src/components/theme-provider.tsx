import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  themeStorageKey?: string
  /** Optional element to apply the theme classes to instead of document.documentElement */
  rootElement?: Element | null
}

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
  rootElement?: Element | null
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  rootElement: null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

/** The stored value is whatever was last written there, not necessarily a theme. */
const isTheme = (value: Theme | null): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system'

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  themeStorageKey = 'theme',
  rootElement,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    storage.getItem<Theme>(`local:${themeStorageKey}`).then((stored) => {
      if (isTheme(stored)) {
        setTheme(stored)
      }
    })
  }, [themeStorageKey])

  useEffect(() => {
    const unwatchTheme = storage.watch<Theme>(`local:${themeStorageKey}`, (newTheme) => {
      if (isTheme(newTheme)) {
        setTheme(newTheme)
      }
    })
    return () => {
      unwatchTheme()
    }
  }, [themeStorageKey])

  // Listen for system theme changes if theme is "system"
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light'
      const root = (rootElement as Element) || window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(systemTheme)
    }

    mediaQuery.addEventListener('change', handleChange)
    // Set initial theme
    handleChange()

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, rootElement])

  // Apply theme when theme changes (except for "system", which is handled above)
  useEffect(() => {
    if (theme === 'system') return
    const root = (rootElement as Element) || window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme, rootElement])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      storage.setItem(`local:${themeStorageKey}`, theme)
      setTheme(theme)
    },
    rootElement,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// The context carries `initialState` as its default, so a consumer outside a
// provider reads the system theme and a no-op setter rather than throwing.
export const useTheme = () => useContext(ThemeProviderContext)
