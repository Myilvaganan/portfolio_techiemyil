import { motion } from 'framer-motion'
import type { SkillCategory } from '@/types'
import { GlassCard } from '@/components/ui/GlassCard'

export function SkillCard({ category, index }: { category: SkillCategory; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
    >
      <GlassCard className="h-full p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
            <category.icon className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-semibold text-text">{category.title}</h3>
        </div>

        <div className="mt-6 space-y-4">
          {category.skills.map((skill) => (
            <div key={skill.name}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-text-secondary">{skill.name}</span>
                <span className="text-text-secondary">{skill.level}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-5">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${skill.level}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover"
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  )
}
