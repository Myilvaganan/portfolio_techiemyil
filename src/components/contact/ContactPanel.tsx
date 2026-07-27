import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ContactInfo } from './ContactInfo'
import { TestimonialForm } from './TestimonialForm'

type Tab = 'contact' | 'testimonial'

const tabs: { id: Tab; label: string }[] = [
  { id: 'contact', label: 'Contact' },
  { id: 'testimonial', label: 'Give a Testimonial' },
]

export function ContactPanel() {
  const [active, setActive] = useState<Tab>('contact')

  return (
    <div className="rounded-[24px] border border-border bg-card/50 p-6 backdrop-blur-sm sm:p-8">
      <div className="mb-7 inline-flex rounded-full border border-border bg-surface-2 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            data-cursor="hover"
            className={cn(
              'relative rounded-full px-4 py-2 text-sm font-medium transition-colors',
              active === tab.id ? 'text-[#05130a]' : 'text-text-secondary hover:text-text',
            )}
          >
            {active === tab.id && (
              <motion.span
                layoutId="contact-tab-pill"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {active === 'contact' ? <ContactInfo /> : <TestimonialForm />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
