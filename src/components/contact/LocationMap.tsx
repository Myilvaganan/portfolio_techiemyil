import { motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { socials } from '@/data/socials'
import { personal } from '@/data/personal'

export function LocationMap() {
  return (
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-border bg-card/40 p-6 sm:p-8">
      <div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-surface-5 bg-bg-secondary">
          <iframe
            title="Map showing Bommanahalli, Bangalore"
            src="https://maps.google.com/maps?q=Bommanahalli%2C%20Bangalore%2C%20India&z=13&output=embed"
            className="absolute inset-0 h-full w-full grayscale-[15%] invert-[92%] hue-rotate-180 light:invert-0 light:hue-rotate-0 light:grayscale-0"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_52%,rgba(34,197,94,0.18),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-surface-5" />
          <div className="pointer-events-none absolute left-[68%] top-[52%]">
            <span className="absolute -left-4 -top-4 h-8 w-8 animate-ping rounded-full bg-accent/30" />
            <span className="relative flex h-2.5 w-2.5 items-center justify-center rounded-full bg-accent shadow-[0_0_16px_4px_rgba(34,197,94,0.5)]" />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="pointer-events-none absolute left-[68%] top-[52%] -translate-x-[calc(100%+12px)] -translate-y-8 whitespace-nowrap rounded-lg border border-border bg-bg/90 px-2.5 py-1 text-[11px] font-medium text-text backdrop-blur-sm"
          >
            <MapPin className="mr-1 inline h-3 w-3 text-accent" />
            Bommanahalli, Bangalore
          </motion.div>
        </div>
        <p className="mt-5 text-sm text-text-secondary">
          Based in {personal.location} · Working with teams across time zones, remote-first.
        </p>
      </div>

      <div className="mt-8">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Find me on</p>
        <div className="flex items-center gap-3">
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
      </div>
    </div>
  )
}
