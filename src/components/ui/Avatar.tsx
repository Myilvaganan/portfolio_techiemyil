import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Full class names so Tailwind can see them. Each pair is a soft, saturated gradient that reads on dark and light themes.
const PALETTE = [
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-fuchsia-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-lime-400 to-green-600',
] as const

/** Same text always gets the same colour, so a person or page keeps its look everywhere. */
export function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** A round avatar: a photo when there is one, otherwise coloured initials. */
export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string; size?: keyof typeof SIZES; className?: string }) {
  return src ? (
    <img src={src} alt="" width={48} height={48} className={cn('shrink-0 rounded-full object-cover ring-2 ring-white/10', SIZES[size], className)} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-2 ring-white/10', SIZES[size], colorFor(name), className)}>
      {initials(name)}
    </span>
  )
}

const BADGE_SIZES = {
  sm: 'h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6',
} as const

/** A colourful gradient tile holding an icon. `seed` picks the colour, so the same page or topic is always the same colour. */
export function IconBadge({ icon: Icon, seed, size = 'md', className }: { icon: LucideIcon; seed: string; size?: keyof typeof BADGE_SIZES; className?: string }) {
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-md shadow-black/20 ring-1 ring-white/15', BADGE_SIZES[size], colorFor(seed), className)}>
      <Icon />
    </span>
  )
}
