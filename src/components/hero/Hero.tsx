import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Download, Globe, MapPin, MousePointer2 } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { HeroPortrait } from './HeroPortrait'
import { HeroStats } from './HeroStats'
import { personal } from '@/data/personal'
import { socials } from '@/data/socials'
import { getLenis } from '@/hooks/useLenis'
import { openResume } from '@/lib/resume'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
}

export function Hero() {
  const [roleIndex, setRoleIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % personal.roles.length)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  function scrollTo(id: string) {
    const el = document.getElementById(id)
    const lenis = getLenis()
    if (el && lenis) lenis.scrollTo(el, { offset: -20 })
    else el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="home" className="relative flex min-h-screen items-center pt-32 pb-20">
      <Container className="relative z-10 grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <Badge>{personal.availability}</Badge>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-7 text-balance font-display text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-text sm:text-6xl lg:text-hero"
          >
            {personal.firstName}
            <br />
            <span className="text-gradient-accent">Sakthivel</span>
          </motion.h1>

          <motion.div variants={item} className="mt-5 h-8 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={roleIndex}
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -24, opacity: 0 }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                className="text-lg font-medium text-text-secondary sm:text-xl"
              >
                {personal.roles[roleIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          <motion.p variants={item} className="mt-6 max-w-xl text-body-lg text-text-secondary">
            {personal.summary}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-4">
            <Button onClick={() => scrollTo('projects')}>
              View Projects
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button variant="secondary" onClick={() => openResume()}>
              <Download className="h-4 w-4" />
              Download Resume
            </Button>
          </motion.div>

          <motion.div variants={item} className="mt-10 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  data-cursor="hover"
                  aria-label={social.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-secondary transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
              <a
                href={personal.links.studio}
                target="_blank"
                rel="noreferrer"
                data-cursor="hover"
                aria-label="Studio"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-secondary transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
              >
                <Globe className="h-4 w-4" />
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <MapPin className="h-4 w-4 text-accent" />
              {personal.location}
            </div>
          </motion.div>
        </motion.div>

        <div className="flex flex-col items-center gap-10">
          <HeroPortrait />
          <div className="w-full max-w-sm">
            <HeroStats />
          </div>
        </div>
      </Container>

      <motion.button
        onClick={() => scrollTo('about')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs text-text-secondary lg:flex"
        aria-label="Scroll down"
      >
        <MousePointer2 className="h-4 w-4 animate-float" />
        Scroll Down
      </motion.button>
    </section>
  )
}
