import { motion } from 'framer-motion'
import type { Service } from '@/types'
import { GlassCard } from '@/components/ui/GlassCard'

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
    >
      <GlassCard className="group h-full p-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent transition-colors duration-300 group-hover:bg-accent group-hover:text-[#05130a]">
          <service.icon className="h-5 w-5" />
        </span>
        <h3 className="mt-5 font-display text-card-title font-semibold text-text">{service.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{service.description}</p>
      </GlassCard>
    </motion.div>
  )
}
