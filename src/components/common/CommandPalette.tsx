import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Mail, Download, ArrowRight } from 'lucide-react'
import { FaGithub, FaLinkedin } from 'react-icons/fa'
import { navLinks } from '@/data/nav'
import { personal } from '@/data/personal'
import { getLenis } from '@/hooks/useLenis'
import { openResume } from '@/lib/resume'
import type { IconComponent } from '@/types'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: IconComponent
  action: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function goToSection(href: string) {
    setOpen(false)
    navigate('/')
    requestAnimationFrame(() => {
      const el = document.querySelector(href)
      const lenis = getLenis()
      if (el && lenis) lenis.scrollTo(el as HTMLElement, { offset: -20 })
      else el?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  const items: CommandItem[] = useMemo(
    () => [
      ...navLinks.map((link) => ({
        id: link.href,
        label: `Go to ${link.label}`,
        hint: 'Section',
        icon: ArrowRight,
        action: () => goToSection(link.href),
      })),
      {
        id: 'resume',
        label: 'Download Resume',
        hint: 'PDF',
        icon: Download,
        action: () => {
          setOpen(false)
          openResume()
        },
      },
      {
        id: 'github',
        label: 'Open GitHub',
        hint: 'External',
        icon: FaGithub,
        action: () => {
          setOpen(false)
          window.open(personal.links.github, '_blank')
        },
      },
      {
        id: 'linkedin',
        label: 'Open LinkedIn',
        hint: 'External',
        icon: FaLinkedin,
        action: () => {
          setOpen(false)
          window.open(personal.links.linkedin, '_blank')
        },
      },
      {
        id: 'email',
        label: 'Send an Email',
        hint: personal.email,
        icon: Mail,
        action: () => {
          setOpen(false)
          window.location.href = `mailto:${personal.email}`
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const filtered = items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm"
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ opacity: 0, y: -16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="fixed left-1/2 top-28 z-[151] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
                >
                  <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <Search className="h-4 w-4 shrink-0 text-text-secondary" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Type a command or search..."
                      className="w-full bg-transparent text-sm text-text placeholder:text-text-secondary focus:outline-none"
                    />
                    <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] text-text-secondary sm:block">
                      ESC
                    </kbd>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {filtered.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-text-secondary">No results found.</p>
                    )}
                    {filtered.map((item) => (
                      <button
                        key={item.id}
                        onClick={item.action}
                        data-cursor="hover"
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-text transition-colors hover:bg-surface-5"
                      >
                        <span className="flex items-center gap-3">
                          <item.icon className="h-4 w-4 text-accent" />
                          {item.label}
                        </span>
                        {item.hint && <span className="text-xs text-text-secondary">{item.hint}</span>}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
