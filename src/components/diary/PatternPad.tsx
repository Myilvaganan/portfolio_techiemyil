import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { haptic } from '@/lib/native'
import { cn } from '@/lib/utils'

// An Android-style 3×3 unlock pattern. Drag across the dots; lifting the finger submits the sequence ("0-4-8-…").

const DOTS = Array.from({ length: 9 }, (_, i) => ({ i, x: 50 + (i % 3) * 100, y: 50 + Math.floor(i / 3) * 100 }))

export function PatternPad({ onDone, error, disabled }: { onDone: (pattern: string) => void; error?: boolean; disabled?: boolean }) {
  const [path, setPath] = useState<number[]>([])
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const drawing = useRef(false)

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 }
  }
  const hit = (p: { x: number; y: number }) => DOTS.find((d) => (d.x - p.x) ** 2 + (d.y - p.y) ** 2 < 32 ** 2)

  function add(p: { x: number; y: number }) {
    const d = hit(p)
    if (d && !path.includes(d.i)) {
      haptic(8)
      setPath((prev) => [...prev, d.i])
    }
  }

  function finish() {
    if (!drawing.current) return
    drawing.current = false
    setCursor(null)
    if (path.length >= 4) onDone(path.join('-'))
    window.setTimeout(() => setPath([]), 350)
  }

  const last = path.length ? DOTS[path[path.length - 1]] : null
  return (
    <motion.svg
      ref={ref}
      viewBox="0 0 300 300"
      className={cn('mx-auto w-full max-w-[18rem] touch-none select-none', disabled && 'pointer-events-none opacity-50')}
      animate={error ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      onPointerDown={(e) => {
        drawing.current = true
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        setPath([])
        add(point(e))
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return
        const p = point(e)
        setCursor(p)
        add(p)
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      role="img"
      aria-label="Unlock pattern: drag across at least four dots"
    >
      {path.slice(1).map((n, k) => {
        const a = DOTS[path[k]]
        const b = DOTS[n]
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="6" strokeLinecap="round" className={error ? 'stroke-error' : 'stroke-accent'} />
      })}
      {last && cursor && <line x1={last.x} y1={last.y} x2={cursor.x} y2={cursor.y} strokeWidth="4" strokeLinecap="round" className="stroke-accent/50" />}
      {DOTS.map((d) => {
        const on = path.includes(d.i)
        return (
          <g key={d.i}>
            <motion.circle cx={d.x} cy={d.y} r={on ? 22 : 0} className={error ? 'fill-error/20' : 'fill-accent/20'} animate={{ r: on ? 22 : 0 }} />
            <circle cx={d.x} cy={d.y} r={on ? 10 : 8} className={on ? (error ? 'fill-error' : 'fill-accent') : 'fill-text-secondary/60'} />
          </g>
        )
      })}
    </motion.svg>
  )
}
