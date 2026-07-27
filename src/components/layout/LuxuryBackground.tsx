import { motion } from 'framer-motion'

export function LuxuryBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-bg" aria-hidden="true">
      <div className="bg-grid absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_20%,transparent_75%)]" />

      <div className="absolute left-1/2 top-[-10%] h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.14),transparent_65%)] blur-2xl" />
      <div className="absolute right-[-10%] top-[35%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.08),transparent_70%)] blur-3xl" />
      <div className="absolute bottom-[-15%] left-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-surface-3),transparent_70%)] blur-3xl" />

      <motion.div
        className="absolute left-[15%] top-[20%] h-1 w-1 rounded-full bg-accent/40"
        animate={{ y: [0, -24, 0], opacity: [0.2, 0.7, 0.2] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-[70%] top-[12%] h-1.5 w-1.5 rounded-full bg-accent/30"
        animate={{ y: [0, 30, 0], opacity: [0.15, 0.5, 0.15] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="absolute left-[45%] top-[55%] h-1 w-1 rounded-full bg-accent/30"
        animate={{ y: [0, -20, 0], opacity: [0.1, 0.45, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2.5 }}
      />
      <motion.div
        className="absolute left-[85%] top-[70%] h-1 w-1 rounded-full bg-accent/40"
        animate={{ y: [0, 26, 0], opacity: [0.15, 0.55, 0.15] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />

      <div className="noise-overlay absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
    </div>
  )
}
