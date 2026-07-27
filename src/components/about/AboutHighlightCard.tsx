import { motion } from 'framer-motion'
import type { AboutHighlight } from '@/types'
import { GlassCard } from '@/components/ui/GlassCard'

export function AboutHighlightCard({ highlight, index }: { highlight: AboutHighlight; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.08 }}
    >
      <GlassCard className="flex items-start gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <highlight.icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text">{highlight.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{highlight.description}</p>
        </div>
      </GlassCard>
    </motion.div>
  )
}
