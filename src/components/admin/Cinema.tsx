import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { personal } from '@/data/personal'

export interface CinemaSlide {
  eyebrow: string
  title: string
  sub?: string
  to?: string
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A short looping "film" drawn live on a canvas: a dusk sky that slowly drifts, twinkling stars and the odd shooting
 * star, with headlines dissolving in and out on top. No video file to download, and it pauses when scrolled off screen.
 */
export function CinemaBanner({ slides, onOpen, className = '' }: { slides: CinemaSlide[]; onOpen?: (to: string) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [index, setIndex] = useState(0)
  const slide = slides[index % Math.max(slides.length, 1)]

  useEffect(() => {
    if (slides.length < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 4200)
    return () => window.clearInterval(id)
  }, [slides.length])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.3, p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.6 }))
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null
    let raf = 0
    let visible = true
    const start = performance.now()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(canvas)

    function cloud(cx: number, cy: number, r: number, color: string) {
      const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx!.fillStyle = g
      ctx!.fillRect(cx - r, cy - r, r * 2, r * 2)
    }

    function frame(now: number) {
      raf = 0
      const t = (now - start) / 1000
      // Sky: deep indigo at the top warming to a rose horizon.
      const sky = ctx!.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#2b2d62')
      sky.addColorStop(0.55, '#7a6aa6')
      sky.addColorStop(1, '#e2b8b4')
      ctx!.fillStyle = sky
      ctx!.fillRect(0, 0, w, h)
      // Drifting cloud banks.
      const d = t * 6
      cloud(((w * 0.2 + d) % (w * 1.6)) - w * 0.3, h * 0.35, h * 0.9, 'rgba(255,214,222,0.28)')
      cloud(((w * 0.9 + d * 0.7) % (w * 1.6)) - w * 0.3, h * 0.75, h * 1.0, 'rgba(255,236,226,0.32)')
      cloud(((w * 0.55 + d * 0.45) % (w * 1.6)) - w * 0.3, h * 0.15, h * 0.7, 'rgba(120,110,190,0.35)')
      // Stars twinkle.
      for (const s of stars) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p))
        ctx!.fillStyle = `rgba(255,255,255,${a * (1 - s.y * 0.6)})`
        ctx!.beginPath()
        ctx!.arc(s.x * w, s.y * h * 0.8, s.r, 0, Math.PI * 2)
        ctx!.fill()
      }
      // A shooting star every few seconds.
      if (!meteor && Math.random() < 0.012) meteor = { x: w * (0.3 + Math.random() * 0.6), y: h * Math.random() * 0.3, vx: -5.5, vy: 3.2, life: 1 }
      if (meteor) {
        const m = meteor
        const g = ctx!.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14)
        g.addColorStop(0, `rgba(255,255,255,${m.life})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx!.strokeStyle = g
        ctx!.lineWidth = 1.4
        ctx!.beginPath()
        ctx!.moveTo(m.x, m.y)
        ctx!.lineTo(m.x - m.vx * 14, m.y - m.vy * 14)
        ctx!.stroke()
        m.x += m.vx
        m.y += m.vy
        m.life -= 0.018
        if (m.life <= 0) meteor = null
      }
      if (visible && !reducedMotion()) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => slide?.to && onOpen?.(slide.to)}
      className={`relative block aspect-[16/11] w-full overflow-hidden rounded-[20px] text-left sm:aspect-[21/8] ${className}`}
      aria-label={slide ? `${slide.eyebrow}: ${slide.title}` : 'Highlights'}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" aria-hidden />
      <AnimatePresence mode="wait">
        {slide && (
          <motion.div
            key={index}
            initial={{ opacity: 0, filter: 'blur(14px)', scale: 1.04 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            exit={{ opacity: 0, filter: 'blur(10px)', scale: 0.98 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/75">{slide.eyebrow}</span>
            <span className="mt-2 bg-gradient-to-b from-white to-[#e7dcff] bg-clip-text font-display text-4xl font-medium leading-tight text-transparent drop-shadow-[0_2px_18px_rgba(140,120,255,0.45)] sm:text-5xl">
              {slide.title}
            </span>
            {slide.sub && <span className="mt-2 max-w-sm text-sm text-white/80">{slide.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>
      {slides.length > 1 && (
        <span className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.title + i} className={`h-1 rounded-full bg-white transition-all duration-500 ${i === index % slides.length ? 'w-5 opacity-90' : 'w-1.5 opacity-40'}`} />
          ))}
        </span>
      )}
    </button>
  )
}

/** A headline whose words rise out of a blur one after another. */
export function NoirTitle({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden className="noir-word" style={{ animationDelay: `${delay + i * 90}ms` }}>
          {word}
          {' '}
        </span>
      ))}
    </span>
  )
}

const SPLASH_KEY = 'noir_splash_shown'

/** Once per session, when the app opens: a black curtain where the name draws in, then lifts away. */
export function NoirSplash() {
  const [show, setShow] = useState(() => {
    if (reducedMotion()) return false
    try {
      if (sessionStorage.getItem(SPLASH_KEY)) return false
      sessionStorage.setItem(SPLASH_KEY, '1')
    } catch {
      return false
    }
    return true
  })
  if (!show) return null
  return (
    <div className="noir-splash fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black text-white" onAnimationEnd={(e) => e.target === e.currentTarget && setShow(false)} aria-hidden>
      <span className="noir-splash-name font-display text-2xl font-medium uppercase sm:text-3xl">{personal.brand}</span>
      <span className="noir-splash-line mt-4 h-px w-24 bg-gradient-to-r from-transparent via-[#c8a464] to-transparent" />
      <span className="noir-splash-name mt-4 text-[10px] font-bold uppercase tracking-[0.4em] text-white/50" style={{ animationDelay: '0.45s' }}>
        Private vault
      </span>
    </div>
  )
}
