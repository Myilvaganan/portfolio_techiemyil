import { Sparkles } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Marquee } from '@/components/ui/Marquee'
import { techStack } from '@/data/techstack'

export function TechStack() {
  const firstHalf = techStack.slice(0, Math.ceil(techStack.length / 2))
  const secondHalf = techStack.slice(Math.ceil(techStack.length / 2))

  return (
    <section className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Toolbox"
          title="Technologies I Work With"
          accentWord="Work"
          align="center"
          className="mx-auto mb-14"
        />
      </Container>

      <div className="space-y-5">
        <Marquee>
          {firstHalf.map((tech) => (
            <span
              key={tech}
              className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/50 px-6 py-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-accent/30 hover:text-text"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {tech}
            </span>
          ))}
        </Marquee>
        <Marquee reverse>
          {secondHalf.map((tech) => (
            <span
              key={tech}
              className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/50 px-6 py-3.5 text-sm font-medium text-text-secondary transition-colors hover:border-accent/30 hover:text-text"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {tech}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  )
}
