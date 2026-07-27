import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { services } from '@/data/services'
import { ServiceCard } from './ServiceCard'

export function Services() {
  return (
    <section id="services" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="What I Do"
          title="Services & Engagements"
          accentWord="Engagements"
          description="From architecture to delivery — the kind of engineering work I take on for teams and products."
          align="center"
          className="mx-auto mb-16"
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, i) => (
            <ServiceCard key={service.id} service={service} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}
