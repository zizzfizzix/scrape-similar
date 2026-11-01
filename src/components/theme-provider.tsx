import { useStorageItem } from '@/hooks/use-storage-item'
import { reportRejection } from '@/utils/report-rejection'
import { createContext, useContext, useLayoutEffect } from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
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
const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark' || value === 'system'

export function ThemeProvider({ children, rootElement, ...props }: ThemeProviderProps) {
  const [storedTheme, setStoredTheme] = useStorageItem(themeItem)
  const theme = isTheme(storedTheme) ? storedTheme : themeItem.fallback

  // Layout effects set the class in the same commit that changes the theme, so
  // no frame is painted with the new theme and the previous class.
  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (theme === 'system') return
    const root = (rootElement as Element) || window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme, rootElement])

  const value = {
    theme,
    setTheme: (next: Theme) => reportRejection(setStoredTheme(next)),
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
