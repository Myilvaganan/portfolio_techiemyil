import { motion, useScroll, useSpring } from 'framer-motion'

export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 })

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed left-0 right-0 top-0 z-[70] h-[2px] origin-left bg-gradient-to-r from-accent to-accent-hover"
    />
  )
}
