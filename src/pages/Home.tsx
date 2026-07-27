import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Hero } from '@/components/hero/Hero'
import { About } from '@/components/about/About'
import { Experience } from '@/components/experience/Experience'
import { Skills } from '@/components/skills/Skills'
import { Projects } from '@/components/projects/Projects'
import { GithubStats } from '@/components/github/GithubStats'
import { Services } from '@/components/services/Services'
import { TechStack } from '@/components/techstack/TechStack'
import { TestimonialsCarousel } from '@/components/testimonials/TestimonialsCarousel'
import { Certifications } from '@/components/certifications/Certifications'
import { Contact } from '@/components/contact/Contact'
import { personal } from '@/data/personal'
import { getLenis } from '@/hooks/useLenis'

export function Home() {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(hash)
      const lenis = getLenis()
      if (el && lenis) lenis.scrollTo(el as HTMLElement, { offset: -20 })
      else el?.scrollIntoView({ behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [hash])

  return (
    <>
      <Helmet>
        <title>{personal.name} — Senior Software Engineer &amp; AI Systems Lead</title>
        <meta name="description" content={personal.summary} />
      </Helmet>
      <Hero />
      <About />
      <Experience />
      <Skills />
      <Projects />
      <GithubStats />
      <Services />
      <TechStack />
      <TestimonialsCarousel />
      <Certifications />
      <Contact />
    </>
  )
}
