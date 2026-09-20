import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useInView, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import { cn } from '@/lib/utils'

export function Reveal({ children, delay = 0, y = 24, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={cn('min-w-0', className)}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// Thin bar under the header that fills as the page is scrolled.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 })
  return <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent" />
}

// Counts up from zero the first time it scrolls into view, and eases to new values afterwards.
export function CountNumber({ value, format, className, duration = 1.1 }: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce || !inView) return
    const controls = animate(from.current, value, { duration, ease: 'easeOut', onUpdate: (v) => { from.current = v; setShown(v) } })
    return () => controls.stop()
  }, [value, inView, reduce, duration])
  return (
    <span ref={ref} className={cn(className)}>
      {format(reduce ? value : shown)}
    </span>
  )
}

export function useInViewOnce<T extends Element>() {
  const ref = useRef<T>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  return { ref, inView }
}
