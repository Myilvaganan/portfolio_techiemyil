import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { getLenis } from '@/hooks/useLenis'

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 700)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function scrollToTop() {
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(0, { duration: 1.2 })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.8 }}
          transition={{ duration: 0.25 }}
          onClick={scrollToTop}
          data-cursor="hover"
          aria-label="Back to top"
          className="fixed bottom-8 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/90 text-text backdrop-blur-md transition-colors hover:border-accent/50 hover:text-accent md:right-10"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
