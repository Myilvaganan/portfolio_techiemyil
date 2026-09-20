import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Shrinks a number to fit its container: an invisible copy of `text` (drawn by CSS, so it isn't duplicated in the
// page text) is measured at full size and the visible number scaled down to fit, never below `min`.
export function FitValue({ children, text, max = 24, min = 11, className }: { children: ReactNode; text: string; max?: number; min?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(max)

  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current
      const p = probe.current
      if (!b || !p) return
      const avail = b.clientWidth
      const natural = p.getBoundingClientRect().width
      setSize(natural > avail && avail > 0 ? Math.max(min, Math.floor(((max * avail) / natural) * 10) / 10) : max)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [text, max, min])

  return (
    <div ref={box} className="relative w-full overflow-hidden">
      <span
        ref={probe}
        aria-hidden
        data-text={text}
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre font-mono font-semibold before:content-[attr(data-text)]"
        style={{ fontSize: max }}
      />
      <div className={className} style={{ fontSize: size }}>
        {children}
      </div>
    </div>
  )
}
