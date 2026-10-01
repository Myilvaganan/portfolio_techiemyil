import { useCallback, useEffect, useState } from 'react'
import { useTheme } from './useTheme'

/** The admin app's look: Noir (monochrome, editorial, CRED-like) or the older gold Aurum. */
export type Skin = 'noir' | 'aurum'
const KEY = 'admin_skin'

function readSkin(): Skin {
  try {
    return localStorage.getItem(KEY) === 'aurum' ? 'aurum' : 'noir'
  } catch {
    return 'noir'
  }
}

/** Puts the skin on <html> (as a class) while the admin is open. Noir only comes in light and dark, so royal maps to those. */
export function useSkin() {
  const [skin, setSkinState] = useState<Skin>(readSkin)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('noir', skin === 'noir')
    return () => root.classList.remove('noir')
  }, [skin])

  useEffect(() => {
    if (skin !== 'noir') return
    if (theme === 'royal') setTheme('dark')
    else if (theme === 'royal-light') setTheme('light')
  }, [skin, theme, setTheme])

  const setSkin = useCallback((s: Skin) => {
    setSkinState(s)
    try {
      localStorage.setItem(KEY, s)
    } catch {
      // Falls back to Noir next time.
    }
  }, [])

  return { skin, setSkin }
}
