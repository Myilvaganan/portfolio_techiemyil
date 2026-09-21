import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'royal'

const THEMES: Theme[] = ['dark', 'light', 'royal']

// Royal is the default. The key was bumped so earlier automatic dark/light values don't hide it; only a choice made from now on is kept.
const STORAGE_KEY = 'theme_v2'

const THEME_COLOR = {
  dark: '#090909',
  light: '#f7f8fa',
  royal: '#0a0612',
} as const

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'royal') return stored
  return 'royal'
}

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  // dark → light → royal → dark
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const cycleTheme = useCallback(() => {
    setTheme((prev) => THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length])
  }, [])

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, cycleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
