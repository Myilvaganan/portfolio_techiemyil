import { Mail, Phone, MapPin, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { personal } from '@/data/personal'
import { socials } from '@/data/socials'

const details = [
  { icon: Mail, label: 'Email', value: personal.email, href: `mailto:${personal.email}` },
  { icon: Phone, label: 'Phone', value: personal.phone, href: `tel:${personal.phone.replace(/\s/g, '')}` },
  { icon: MapPin, label: 'Location', value: personal.location, href: undefined },
]

export function ContactInfo() {
  return (
    <div className="flex flex-col gap-8 py-2">
      <div className="space-y-5">
        {details.map((detail) => {
          const content = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <detail.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-secondary">{detail.label}</p>
                <p className="text-sm font-medium text-text">{detail.value}</p>
              </div>
            </>
          )
          return detail.href ? (
            <a
              key={detail.label}
              href={detail.href}
              data-cursor="hover"
              className="flex items-center gap-4 transition-opacity hover:opacity-80"
            >
              {content}
            </a>
          ) : (
            <div key={detail.label} className="flex items-center gap-4">
              {content}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        {socials.map((social) => (
          <a
            key={social.label}
            href={social.href}
            target="_blank"
            rel="noreferrer"
            data-cursor="hover"
            aria-label={social.label}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-secondary transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
          >
            <social.icon className="h-4 w-4" />
          </a>
        ))}
      </div>

      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-6">
        <p className="text-sm leading-relaxed text-text-secondary">
          For project inquiries, collaborations, and freelance engagements, head over to my studio site.
        </p>
        <Button
          className="mt-5 w-full sm:w-auto"
          onClick={() => window.open(personal.links.studio, '_blank')}
        >
          Visit studio.techiemyil.com
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
