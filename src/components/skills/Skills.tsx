import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { skillCategories } from '@/data/skills'
import { SkillCard } from './SkillCard'

export function Skills() {
  return (
    <section id="skills" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Capabilities"
          title="Skills & Technologies"
          accentWord="Technologies"
          description="A full-stack, cloud-native toolkit built for production-grade delivery — from languages to monitoring."
          align="center"
          className="mx-auto mb-16"
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {skillCategories.map((category, i) => (
            <SkillCard key={category.id} category={category} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}
