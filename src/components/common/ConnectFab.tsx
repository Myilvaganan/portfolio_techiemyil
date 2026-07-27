import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mail, MessageCircle, Phone, X } from 'lucide-react'
import { FaGithub, FaWhatsapp } from 'react-icons/fa'
import { personal } from '@/data/personal'

const actions = [
  { label: 'GitHub', href: personal.links.github, icon: FaGithub, external: true },
  { label: 'WhatsApp', href: personal.links.whatsapp, icon: FaWhatsapp, external: true },
  { label: 'Email', href: `mailto:${personal.email}`, icon: Mail },
  { label: 'Call', href: `tel:${personal.phone}`, icon: Phone },
]

export function ConnectFab() {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 500)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-6 left-4 z-50 flex flex-col items-center gap-3"
        >
          <AnimatePresence>
            {open &&
              actions.map((action, i) => (
                <motion.a
                  key={action.label}
                  href={action.href}
                  target={action.external ? '_blank' : undefined}
                  rel={action.external ? 'noreferrer' : undefined}
                  initial={{ opacity: 0, y: 12, scale: 0.7 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.7 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  aria-label={action.label}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card/90 text-text shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <action.icon className="h-5 w-5" />
                </motion.a>
              ))}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? 'Close quick contact menu' : 'Open quick contact menu'}
            aria-expanded={open}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[#05130a] shadow-[0_8px_28px_-6px_rgba(34,197,94,0.55)] transition-transform active:scale-95"
          >
            <motion.span
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center"
            >
              {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
            </motion.span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
