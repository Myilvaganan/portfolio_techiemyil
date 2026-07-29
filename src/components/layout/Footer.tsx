import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { Logo } from '@/components/ui/Logo'
import { navLinks } from '@/data/nav'
import { socials } from '@/data/socials'
import { personal } from '@/data/personal'
import { getLenis } from '@/hooks/useLenis'

export function Footer() {
  function handleNavClick(href: string) {
    const el = document.querySelector(href)
    const lenis = getLenis()
    if (el && lenis) lenis.scrollTo(el as HTMLElement, { offset: -20 })
    else el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer className="relative border-t border-border bg-bg-secondary/40">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-text-secondary">
            Passionate about building scalable, intelligent solutions that drive real business impact through
            technology and innovation.
          </p>
        </div>

        <div>
          <h3 className="mb-5 text-sm font-semibold text-text">Quick Links</h3>
          <ul className="space-y-3">
            {navLinks
              .filter((l) => l.href !== '#home')
              .map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    data-cursor="hover"
                    onClick={(e) => {
                      e.preventDefault()
                      handleNavClick(link.href)
                    }}
                    className="text-sm text-text-secondary transition-colors hover:text-accent"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-5 text-sm font-semibold text-text">Let's Connect</h3>
          <a
            href={`mailto:${personal.email}`}
            className="block text-sm text-text-secondary transition-colors hover:text-accent"
          >
            {personal.email}
          </a>
          <p className="mt-2 text-sm text-text-secondary">{personal.location}</p>
          <div className="mt-5 flex items-center gap-3">
            {socials.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                data-cursor="hover"
                aria-label={social.label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
              >
                <social.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </Container>

      <div className="border-t border-border py-6">
        <Container className="flex flex-col items-center justify-between gap-3 text-xs text-text-secondary sm:flex-row">
          <p>© {new Date().getFullYear()} {personal.name}. All Rights Reserved.</p>
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-1.5">
              Built with React + TypeScript
              <Heart className="h-3.5 w-3.5 fill-accent text-accent" />
            </p>
            <Link to="/admin" className="text-text-secondary/40 transition-colors hover:text-text-secondary">
              Admin
            </Link>
          </div>
        </Container>
      </div>
    </footer>
  )
}
