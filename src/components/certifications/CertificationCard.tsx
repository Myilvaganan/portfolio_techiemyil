import { motion } from 'framer-motion'
import { CheckCircle2, Trophy } from 'lucide-react'
import type { Certification } from '@/types'

export function CertificationCard({ cert, index }: { cert: Certification; index: number }) {
  const Icon = cert.type === 'award' ? Trophy : CheckCircle2

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: (index % 6) * 0.05 }}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card/40 p-4 transition-colors hover:border-accent/30"
    >
      <Icon className={cert.type === 'award' ? 'mt-0.5 h-4 w-4 shrink-0 text-accent-hover' : 'mt-0.5 h-4 w-4 shrink-0 text-accent'} />
      <div>
        <p className="text-sm font-medium text-text">{cert.title}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {cert.issuer}
          {cert.year ? ` · ${cert.year}` : ''}
        </p>
      </div>
    </motion.div>
  )
}
