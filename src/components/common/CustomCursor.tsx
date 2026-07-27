import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export function CustomCursor() {
  const isCoarse = useMediaQuery('(pointer: coarse)')
  const [isHovering, setIsHovering] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const springConfig = { damping: 28, stiffness: 320, mass: 0.4 }
  const springX = useSpring(x, springConfig)
  const springY = useSpring(y, springConfig)

  const glowSpringConfig = { damping: 34, stiffness: 140, mass: 0.7 }
  const glowX = useSpring(x, glowSpringConfig)
  const glowY = useSpring(y, glowSpringConfig)

  useEffect(() => {
    if (isCoarse) return
    document.documentElement.classList.add('has-custom-cursor')

    function handleMove(e: MouseEvent) {
      x.set(e.clientX)
      y.set(e.clientY)
      if (!isVisible) setIsVisible(true)
      const target = e.target as HTMLElement
      setIsHovering(!!target.closest('[data-cursor="hover"]'))
    }

    function handleLeaveWindow() {
      setIsVisible(false)
    }

    window.addEventListener('mousemove', handleMove)
    document.documentElement.addEventListener('mouseleave', handleLeaveWindow)
    return () => {
      document.documentElement.classList.remove('has-custom-cursor')
      window.removeEventListener('mousemove', handleMove)
      document.documentElement.removeEventListener('mouseleave', handleLeaveWindow)
    }
  }, [isCoarse, isVisible, x, y])

  if (isCoarse) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] hidden md:block" aria-hidden="true">
      <motion.div
        className="absolute rounded-full bg-accent/15 blur-2xl"
        style={{
          left: glowX,
          top: glowY,
          width: 200,
          height: 200,
          x: '-50%',
          y: '-50%',
          opacity: isVisible ? 1 : 0,
        }}
      />
      <motion.div
        className="absolute rounded-full border border-accent/60"
        style={{
          left: springX,
          top: springY,
          x: '-50%',
          y: '-50%',
          opacity: isVisible ? 1 : 0,
        }}
        animate={{
          width: isHovering ? 56 : 28,
          height: isHovering ? 56 : 28,
          backgroundColor: isHovering ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0)',
        }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute rounded-full bg-accent"
        style={{
          left: x,
          top: y,
          x: '-50%',
          y: '-50%',
          width: 6,
          height: 6,
          opacity: isVisible ? 1 : 0,
        }}
      />
    </div>
  )
}
