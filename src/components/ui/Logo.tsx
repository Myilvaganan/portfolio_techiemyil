import tmLogo from '@/assets/images/logo.png'
import tmLogoGold from '@/assets/images/logo-gold.png'
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
      {showName && <span className="font-display text-[15px] font-semibold text-text">{personal.brand}</span>}
    </span>
  )
}
