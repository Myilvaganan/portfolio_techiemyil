import { motion } from 'framer-motion'
import { stats } from '@/data/stats'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { Tooltip } from '@/components/ui/Tooltip'

export function HeroStats() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {stats.map((stat, i) => {
        const card = (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 + i * 0.1 }}
            className="h-full rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm transition-colors hover:border-accent/30"
          >
            <stat.icon className="mb-2 h-4 w-4 text-accent" />
            <div className="font-display text-2xl font-semibold text-text">
              <AnimatedCounter value={stat.value} suffix={stat.suffix} />
            </div>
            <div className="mt-1 text-xs text-text-secondary">{stat.label}</div>
          </motion.div>
        )

        return stat.tooltip ? (
          <Tooltip key={stat.label} content={stat.tooltip}>
            {card}
          </Tooltip>
        ) : (
          card
        )
      })}
    </div>
  )
}
