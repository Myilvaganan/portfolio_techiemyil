import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Download, Menu, X, Command } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { navLinks } from '@/data/nav'
import { useActiveSection } from '@/hooks/useActiveSection'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { getLenis } from '@/hooks/useLenis'
import { cn } from '@/lib/utils'
import { openResume } from '@/lib/resume'

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeId = useActiveSection(navLinks.map((l) => l.href.replace('#', '')))
  const location = useLocation()
  const navigate = useNavigate()

  useLockBodyScroll(mobileOpen)

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 24)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function handleNavClick(href: string) {
    setMobileOpen(false)
    if (location.pathname !== '/') {
      navigate('/' + href)
      return
    }
    const el = document.querySelector(href)
    const lenis = getLenis()
    if (el && lenis) lenis.scrollTo(el as HTMLElement, { offset: -20 })
    else el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          scrolled ? 'border-b border-border bg-bg/70 backdrop-blur-xl' : 'border-b border-transparent bg-transparent',
        )}
      >
        <Container className="flex h-20 items-center justify-between">
          <a
            href="#home"
            data-cursor="hover"
            onClick={(e) => {
              e.preventDefault()
              handleNavClick('#home')
            }}
          >
            <Logo />
          </a>

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => {
              const isActive = location.pathname === '/' && activeId === link.href.replace('#', '')
              return (
                <a
                  key={link.href}
                  href={link.href}
                  data-cursor="hover"
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavClick(link.href)
                  }}
                  className={cn(
                    'relative px-4 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-text' : 'text-text-secondary hover:text-text',
                  )}
                >
                  {link.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-4 -bottom-1 h-px bg-accent"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </a>
              )
            })}
            <div className="relative">
              <span
                aria-hidden="true"
                className="animate-glow-pulse absolute inset-0 -z-10 rounded-full bg-accent/40 blur-md"
              />
              <NavLink
                to="/at-a-glance"
                data-cursor="hover"
                className={({ isActive }) =>
                  cn(
                    'relative rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-accent/40 text-accent'
                      : 'border-transparent text-text-secondary hover:text-text',
                  )
                }
              >
                At a Glance
              </NavLink>
            </div>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <ThemeToggle />
            <button
              data-cursor="hover"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
              aria-label="Open command palette"
            >
              <Command className="h-3.5 w-3.5" />
              <span>K</span>
            </button>
            <Button
              size="sm"
              onClick={() => openResume()}
              className="shadow-[0_0_20px_2px_rgba(34,197,94,0.3)]"
            >
              <Download className="h-4 w-4" />
              Resume
            </Button>
          </div>

          <div className="flex items-center gap-3 lg:hidden">
            <ThemeToggle />
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </Container>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-bg/95 backdrop-blur-xl lg:hidden"
          >
            <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavClick(link.href)
                  }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="font-display text-3xl font-medium text-text"
                >
                  {link.label}
                </motion.a>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: navLinks.length * 0.05 }}
              >
                <Link
                  to="/at-a-glance"
                  onClick={() => setMobileOpen(false)}
                  className="relative inline-flex items-center gap-2 font-display text-3xl font-medium text-accent"
                >
                  At a Glance
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-glow-pulse absolute inline-flex h-full w-full rounded-full bg-accent" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                  </span>
                </Link>
              </motion.div>
              <Button onClick={() => openResume()} className="mt-4">
                <Download className="h-4 w-4" />
                Download Resume
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
