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

const applyTheme = (rootElement: Element | null | undefined, theme: Exclude<Theme, 'system'>) => {
  const root = rootElement ?? document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function ThemeProvider({ children, rootElement, ...props }: ThemeProviderProps) {
  const [storedTheme, setStoredTheme] = useStorageItem(themeItem)
  const theme = isTheme(storedTheme) ? storedTheme : themeItem.fallback

  // A layout effect sets the class in the same commit that changes the theme;
  // a passive effect can run after a frame has been painted with the new theme
  // and the previous class.
  useLayoutEffect(() => {
    if (theme !== 'system') {
      applyTheme(rootElement, theme)
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme(rootElement, mediaQuery.matches ? 'dark' : 'light')

    mediaQuery.addEventListener('change', handleChange)
    handleChange()

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
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
