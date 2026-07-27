import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SectionHeadingProps {
  eyebrow?: string
  title: string
  accentWord?: string
  description?: string
  align?: 'left' | 'center'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  accentWord,
  description,
  align = 'left',
  className,
}: SectionHeadingProps) {
  const parts = accentWord ? title.split(accentWord) : [title]

  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-accent"
        >
          {eyebrow}
        </motion.p>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className="text-balance text-[2.25rem] font-semibold leading-[1.1] tracking-tight text-text md:text-section"
      >
        {accentWord ? (
          <>
            {parts[0]}
            <span className="text-gradient-accent">{accentWord}</span>
            {parts[1]}
          </>
        ) : (
          title
        )}
      </motion.h2>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-5 text-body-lg text-text-secondary"
        >
          {description}
        </motion.p>
      )}
    </div>
  )
}
