import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ExperienceTimeline } from './ExperienceTimeline'

export function Experience() {
  return (
    <section id="experience" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Career Journey"
          title="Professional Experience"
          accentWord="Experience"
          description="Seven years of shipping production systems — from IoT telemetry pipelines to AI-assisted operations platforms."
          align="center"
          className="mx-auto mb-16"
        />
        <div className="mx-auto max-w-3xl">
          <ExperienceTimeline />
        </div>
      </Container>
    </section>
  )
}
