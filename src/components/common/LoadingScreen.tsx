import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { personal } from '@/data/personal'

export function LoadingScreen() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-bg"
        >
          <motion.div
            initial={{ opacity: 0, letterSpacing: '0.1em' }}
            animate={{ opacity: 1, letterSpacing: '-0.02em' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="font-display text-xl font-semibold text-text sm:text-2xl"
          >
            Initializing {personal.brand}<span className="text-accent animate-pulse">...</span>
          </motion.div>
          <div className="h-[2px] w-40 overflow-hidden rounded-full bg-surface-10">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              className="h-full w-full bg-gradient-to-r from-transparent via-accent to-transparent"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
