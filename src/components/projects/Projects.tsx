import { useMemo, useState } from 'react'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { projects } from '@/data/projects'
import { ProjectFilter } from './ProjectFilter'
import { ProjectCard } from './ProjectCard'

export function Projects() {
  const categories = useMemo(() => ['All', ...new Set(projects.map((p) => p.category))], [])
  const [active, setActive] = useState('All')

  const filtered = active === 'All' ? projects : projects.filter((p) => p.category === active)

  return (
    <section id="projects" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Selected Work"
          title="Featured Projects"
          accentWord="Projects"
          description="A selection of personal builds spanning full-stack platforms, e-commerce, and frontend engineering."
          align="center"
          className="mx-auto mb-10"
        />
        <div className="mb-14">
          <ProjectFilter categories={categories} active={active} onChange={setActive} />
        </div>
        <div className="space-y-8">
          {filtered.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}
