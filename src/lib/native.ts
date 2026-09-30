import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// App-like behaviour for the installed admin on a phone (built for Android / Chrome, harmless on desktop):
//   • screens slide forward/back like native navigation, tab switches just fade
//   • every tap gives a light vibration and a ripple
//   • dialogs become bottom sheets: drag the handle down to close, and the Android back gesture closes the sheet
//     before it leaves the page

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

// ---------- Navigation direction ----------

export type NavDirection = 'forward' | 'back' | 'tab'
let nextIsTab = false
/** Call before a bottom-tab navigation so the next screen fades in instead of sliding. */
export const markTabNavigation = () => {
  nextIsTab = true
}

/** Which way the last navigation went, from React Router's history index. */
export function useNavDirection(): NavDirection {
  const location = useLocation()
  const last = useRef<number>((window.history.state?.idx as number) ?? 0)
  const [dir, setDir] = useState<NavDirection>('tab')
  useEffect(() => {
    const idx = (window.history.state?.idx as number) ?? 0
    setDir(nextIsTab ? 'tab' : idx < last.current ? 'back' : 'forward')
    nextIsTab = false
    last.current = idx
  }, [location.key])
  return dir
}

export const SLIDE = {
  forward: { initial: { opacity: 0, x: '28%' }, animate: { opacity: 1, x: 0 } },
  back: { initial: { opacity: 0, x: '-22%' }, animate: { opacity: 1, x: 0 } },
  tab: { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } },
} as const

// ---------- Haptics ----------

export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Not supported (iPhone, desktop): silent.
  }
}

// ---------- Ripple + haptic on every tap ----------

function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button:not(:disabled), a[href], [role="button"], [role="switch"], [role="tab"]')
  if (!el || el.closest('[data-no-ripple]')) return
  haptic(6)
  // The ripple is drawn in its own layer on <body>, clipped to the control's shape — never inside the control.
  // Adding nodes (or inline styles) to elements React owns can make its next update crash the app.
  const rect = el.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height) * 1.6
  const cs = getComputedStyle(el)
  const frame = document.createElement('span')
  frame.className = 'native-ripple-frame'
  Object.assign(frame.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: cs.borderRadius })
  const ripple = document.createElement('span')
  ripple.className = 'native-ripple'
  Object.assign(ripple.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - rect.left - size / 2}px`, top: `${e.clientY - rect.top - size / 2}px`, background: cs.color })
  frame.appendChild(ripple)
  document.body.appendChild(frame)
  window.setTimeout(() => frame.remove(), 560)
}

// ---------- Bottom sheets ----------

const openDialog = () => document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

/** Drag a sheet down by its top edge to dismiss it. */
function sheetDrag() {
  let sheet: HTMLElement | null = null
  let startY = 0
  let dy = 0
  const start = (e: TouchEvent) => {
    const d = openDialog()
    if (!d || !d.contains(e.target as Node)) return
    const top = d.getBoundingClientRect().top
    // Only the top strip (the grab handle area) drags, so scrolling inside the sheet still works.
    if (e.touches[0].clientY - top > 44) return
    sheet = d
    startY = e.touches[0].clientY
    dy = 0
    sheet.style.transition = 'none'
  }
  const move = (e: TouchEvent) => {
    if (!sheet) return
    dy = Math.max(0, e.touches[0].clientY - startY)
    sheet.style.transform = `translateY(${dy}px)`
  }
  const end = () => {
    if (!sheet) return
    const s = sheet
    sheet = null
    s.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)'
    if (dy > 110) {
      haptic(10)
      s.style.transform = 'translateY(100%)'
      window.setTimeout(pressEscape, 180)
    } else s.style.transform = ''
  }
  document.addEventListener('touchstart', start, { passive: true })
  document.addEventListener('touchmove', move, { passive: true })
  document.addEventListener('touchend', end, { passive: true })
  return () => {
    document.removeEventListener('touchstart', start)
    document.removeEventListener('touchmove', move)
    document.removeEventListener('touchend', end)
  }
}

/**
 * Android back while a sheet is open closes the sheet, not the page: an extra history entry is pushed when a sheet
 * opens; back pops it and closes the sheet. When the sheet is closed another way, the extra entry is removed.
 */
function sheetBack() {
  let guarded = false
  let closingByBack = false
  const sync = () => {
    const open = Boolean(openDialog())
    if (open && !guarded) {
      window.history.pushState({ ...window.history.state, sheet: true }, '')
      guarded = true
    } else if (!open && guarded) {
      guarded = false
      if (closingByBack) closingByBack = false
      else if (window.history.state?.sheet) window.history.back()
    }
  }
  const onPop = (e: PopStateEvent) => {
    if (guarded && !e.state?.sheet && openDialog()) {
      e.stopImmediatePropagation()
      closingByBack = true
      guarded = false
      pressEscape()
    }
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })
  window.addEventListener('popstate', onPop, true)
  return () => {
    observer.disconnect()
    window.removeEventListener('popstate', onPop, true)
  }
}

/** Install the app-like touch behaviour once, for the admin shell. */
export function useNativeFeel() {
  useEffect(() => {
    if (!isTouch()) return
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    const stopDrag = sheetDrag()
    const stopBack = sheetBack()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      stopDrag()
      stopBack()
    }
  }, [])
}

/** True once the page's own title (its first h1) has scrolled under the top bar — the bar then shows it compactly. */
export function useTitleScrolledAway(key: string) {
  const [title, setTitle] = useState<string | null>(null)
  useEffect(() => {
    setTitle(null)
    let observer: IntersectionObserver | null = null
    const timer = window.setTimeout(() => {
      const h1 = document.querySelector<HTMLElement>('main h1')
      if (!h1) return
      observer = new IntersectionObserver(([entry]) => setTitle(entry.isIntersecting ? null : h1.textContent), { rootMargin: '-64px 0px 0px 0px' })
      observer.observe(h1)
    }, 350)
    return () => {
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [key])
  return title
}
