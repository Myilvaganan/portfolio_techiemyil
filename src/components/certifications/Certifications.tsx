import { Award, ShieldCheck } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { GlassCard } from '@/components/ui/GlassCard'
import { certifications } from '@/data/certifications'
import { CertificationCard } from './CertificationCard'

export function Certifications() {
  const certs = certifications.filter((c) => c.type === 'certification')
  const awards = certifications.filter((c) => c.type === 'award')

  return (
    <section id="certifications" className="relative py-section">
      <Container>
        <SectionHeading
          eyebrow="Recognition"
          title="Certifications & Awards"
          accentWord="Awards"
          description="Continuous upskilling and recognition earned through delivery, leadership, and technical depth."
          align="center"
          className="mx-auto mb-16"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <GlassCard hover={false} className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3 text-text">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h3 className="font-display text-lg font-semibold">Certifications</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {certs.map((cert, i) => (
                <CertificationCard key={cert.id} cert={cert} index={i} />
              ))}
            </div>
          </GlassCard>

          <GlassCard hover={false} className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3 text-text">
              <Award className="h-5 w-5 text-accent-hover" />
              <h3 className="font-display text-lg font-semibold">Awards</h3>
            </div>
            <div className="grid gap-3">
              {awards.map((cert, i) => (
                <CertificationCard key={cert.id} cert={cert} index={i} />
              ))}
            </div>
          </GlassCard>
        </div>
      </Container>
    </section>
  )
}
