import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ContactPanel } from './ContactPanel'
import { LocationMap } from './LocationMap'

export function Contact() {
  return (
    <section id="contact" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Get In Touch"
          title="Let's Build Something Amazing"
          accentWord="Amazing"
          description="Have a project in mind, or just want to talk shop? My inbox is always open."
          align="center"
          className="mx-auto mb-16"
        />
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <ContactPanel />
          <LocationMap />
        </div>
      </Container>
    </section>
  )
}
