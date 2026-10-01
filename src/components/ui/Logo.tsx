import tmLogo from '@/assets/images/logo.webp'
import tmLogoGold from '@/assets/images/logo-gold.webp'
import { personal } from '@/data/personal'
import { cn } from '@/lib/utils'

interface LogoProps {
  showName?: boolean
  className?: string
}

export function Logo({ showName = true, className }: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <img src={tmLogo} alt={`${personal.brand} logo`} className="logo-default h-9 w-9 rounded-full" width={36} height={36} />
      {/* Gold mark for the royal theme; the theme decides which of the two is visible. */}
      <img src={tmLogoGold} alt="" aria-hidden="true" className="logo-royal h-9 w-9 rounded-full" width={36} height={36} />
      {/* Noir (admin): a quiet ink monogram in the headline serif with a gold hairline ring, instead of the neon mark. */}
      <span aria-hidden="true" className="logo-noir h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text text-bg shadow-[inset_0_0_0_1px_rgba(200,164,100,0.55),0_0_0_1px_var(--color-border)]">
        <span className="font-display text-[13px] font-medium italic leading-none tracking-[-0.02em]">TM</span>
      </span>
      {showName && (
        <span className="logo-name font-display text-[15px] font-semibold text-text">
          {personal.brand}
        </span>
      )}
    </span>
  )
}
