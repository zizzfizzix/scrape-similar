import { useLoadedStorageItem } from '@/hooks/use-storage-item'
import { reportRejection } from '@/utils/report-rejection'
import { isTheme, writeThemeMirror } from '@/utils/theme-mirror'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from 'react'

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

const applyTheme = (root: Element, theme: Exclude<Theme, 'system'>) => {
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export function ThemeProvider({ children, rootElement, ...props }: ThemeProviderProps) {
  const [storedTheme, setStoredTheme] = useLoadedStorageItem(themeItem)
  const isLoaded = storedTheme !== undefined
  const theme = isTheme(storedTheme) ? storedTheme : themeItem.fallback

  // A layout effect sets the class in the same commit that changes the theme;
  // a passive effect can run after a frame has been painted with the new theme
  // and the previous class.
  useLayoutEffect(() => {
    if (!isLoaded) return

    const root = rootElement ?? document.documentElement
    const removeClass = () => root.classList.remove('light', 'dark')

    if (theme !== 'system') {
      applyTheme(root, theme)
      return removeClass
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applyTheme(root, mediaQuery.matches ? 'dark' : 'light')

    mediaQuery.addEventListener('change', handleChange)
    handleChange()

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
      removeClass()
    }
  }, [isLoaded, theme, rootElement])

  useEffect(() => {
    if (isLoaded) writeThemeMirror(theme)
  }, [isLoaded, theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: Theme) => reportRejection(setStoredTheme(next)),
      rootElement,
    }),
    [theme, setStoredTheme, rootElement],
  )

  // Rendering before the stored theme is known would paint the page in the
  // fallback theme and then switch.
  if (!isLoaded) return null

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

// The context carries `initialState` as its default, so a consumer outside a
// provider reads the system theme and a no-op setter rather than throwing.
export const useTheme = () => useContext(ThemeProviderContext)
