import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Star } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { certifications } from '@/data/certifications'

const certs = certifications.filter((c) => c.type === 'certification')
const awards = certifications.filter((c) => c.type === 'award')

export function CertificationsPanel() {
  return (
    <GlassCard hover={false} className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-text">
          Certifications <span className="text-accent">&amp; Awards</span>
        </h2>
        <Link
          to="/#certifications"
          className="flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-accent"
        >
          View All
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Certifications</p>
          <ul className="space-y-1.5">
            {certs.map((cert) => (
              <li key={cert.id} className="flex items-start gap-2 text-xs text-text-secondary">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  {cert.title} <span className="text-text-secondary/70">– {cert.issuer}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Awards</p>
          <ul className="space-y-1.5">
            {awards.map((award) => (
              <li key={award.id} className="flex items-start gap-2 text-xs text-text-secondary">
                <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-accent text-accent" />
                <span>
                  {award.title} <span className="text-text-secondary/70">– {award.issuer}{award.year ? `, ${award.year}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </GlassCard>
  )
}
