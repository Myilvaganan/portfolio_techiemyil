import { useCallback, useEffect, useState } from 'react'

export const UI_SCALES = [
  { id: 'small', label: 'Small', percent: 100 },
  { id: 'medium', label: 'Medium', percent: 112.5 },
  { id: 'large', label: 'Large', percent: 125 },
  { id: 'xl', label: 'Extra large', percent: 137.5 },
] as const

export type UiScaleId = (typeof UI_SCALES)[number]['id']

const KEY = 'admin-ui-scale'

function defaultScale(): UiScaleId {
  // Phones and tablets get bigger controls out of the box; desktop keeps the compact layout.
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'large' : 'small'
  } catch {
    return 'small'
  }
}

function read(): UiScaleId {
  try {
    const saved = localStorage.getItem(KEY)
    if (UI_SCALES.some((s) => s.id === saved)) return saved as UiScaleId
  } catch {
    /* storage can be blocked */
  }
  return defaultScale()
}

/** Scales the whole admin (everything is rem-based) by changing the root font size, and remembers the choice. */
export function useUiScale() {
  const [scale, setScaleState] = useState<UiScaleId>(read)

  useEffect(() => {
    const root = document.documentElement
    const percent = UI_SCALES.find((s) => s.id === scale)!.percent
    root.style.fontSize = `${percent}%`
    return () => {
      root.style.fontSize = ''
    }
  }, [scale])

  const setScale = useCallback((id: UiScaleId) => {
    setScaleState(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  return { scale, setScale }
}
