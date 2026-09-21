import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/hooks/useTheme'

// Small seeded generator so the sky is the same on every render instead of reshuffling.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Burst {
  id: number
  x: number
  y: number
  parts: { dx: number; dy: number; size: number }[]
}

// Twinkling stars and drifting gold dust behind everything, plus a little burst of stars where you click.
// Only mounted for the royal theme.
export function RoyalSparkles() {
  const { theme } = useTheme()
  if (theme !== 'royal') return null
  return <Sky />
}

function Sky() {
  const compact = typeof window !== 'undefined' && window.innerWidth < 768
  const { stars, dust } = useMemo(() => {
    const r = rng(1729)
    const stars = Array.from({ length: compact ? 22 : 44 }, () => ({
      left: r() * 100,
      top: r() * 100,
      size: 5 + r() * 11,
      dur: 3 + r() * 4,
      delay: r() * 6,
    }))
    const dust = Array.from({ length: compact ? 8 : 18 }, () => ({
      left: r() * 100,
      top: 40 + r() * 60,
      size: 2 + r() * 3,
      dur: 9 + r() * 9,
      delay: r() * 10,
    }))
    return { stars, dust }
  }, [compact])

  const [bursts, setBursts] = useState<Burst[]>([])
  const next = useRef(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    function onDown(e: PointerEvent) {
      const id = next.current++
      const parts = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5
        const d = 26 + Math.random() * 30
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: 6 + Math.random() * 8 }
      })
      setBursts((b) => [...b.slice(-5), { id, x: e.clientX, y: e.clientY, parts }])
      window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 800)
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true" data-testid="royal-sparkles">
      {stars.map((s, i) => (
        <span key={`s${i}`} className="royal-star" style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, ['--dur' as string]: `${s.dur}s`, ['--delay' as string]: `${s.delay}s` }} />
      ))}
      {dust.map((d, i) => (
        <span key={`d${i}`} className="royal-dust" style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, ['--dur' as string]: `${d.dur}s`, ['--delay' as string]: `${d.delay}s` }} />
      ))}
      {bursts.map((b) =>
        b.parts.map((p, i) => (
          <span key={`${b.id}-${i}`} className="royal-burst" style={{ left: b.x, top: b.y, width: p.size, height: p.size, ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px` }} />
        )),
      )}
    </div>
  )
}
