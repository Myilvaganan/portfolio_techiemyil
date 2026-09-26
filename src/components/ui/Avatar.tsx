import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Full class names so Tailwind can see them. Ordered so that neighbouring entries are far apart in hue.
const PALETTE = [
  'from-rose-400 to-red-600',
  'from-sky-400 to-blue-600',
  'from-amber-400 to-orange-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-fuchsia-400 to-pink-600',
  'from-cyan-400 to-sky-600',
  'from-orange-400 to-red-500',
  'from-indigo-400 to-violet-600',
  'from-lime-400 to-green-600',
  'from-pink-400 to-rose-600',
  'from-teal-300 to-emerald-700',
  'from-blue-300 to-cyan-700',
  'from-yellow-400 to-amber-600',
  'from-purple-400 to-fuchsia-600',
  'from-green-400 to-emerald-600',
  'from-red-300 to-orange-600',
  'from-sky-300 to-indigo-600',
  'from-fuchsia-300 to-purple-700',
  'from-lime-300 to-emerald-600',
  'from-pink-300 to-fuchsia-600',
  'from-cyan-300 to-teal-700',
  'from-yellow-300 to-orange-600',
  'from-violet-300 to-indigo-700',
  'from-slate-400 to-slate-600',
  'from-stone-400 to-neutral-600',
  'from-blue-400 to-indigo-600',
  'from-teal-400 to-cyan-600',
  'from-orange-300 to-amber-600',
  'from-rose-300 to-pink-700',
] as const

const assigned = new Map<string, string>()

/**
 * Gives each of these names its own colour, in order, so no two in the list share one (up to the palette size).
 * Call it once per group that appears together, such as the menu items.
 */
export function assignColors(seeds: string[]) {
  seeds.forEach((seed, i) => assigned.set(seed, PALETTE[i % PALETTE.length]))
}

/** The colour registered for this name, else a stable one picked from its text. */
export function colorFor(seed: string): string {
  const fixed = assigned.get(seed)
  if (fixed) return fixed
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
    .split(/[\s()/_.-]+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => (w.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase())
    .join('') || '?'

/** A round avatar: a photo when there is one, otherwise coloured initials. */
export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string; size?: keyof typeof SIZES; className?: string }) {
  return src ? (
    <img src={src} alt="" width={48} height={48} className={cn('shrink-0 rounded-full object-cover ring-2 ring-white/10', SIZES[size], className)} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-3px_5px_rgba(0,0,0,0.25),0_6px_12px_-4px_rgba(0,0,0,0.5)]', SIZES[size], colorFor(name), className)}>
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
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br text-white ring-1 ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-3px_5px_rgba(0,0,0,0.25),0_8px_14px_-5px_rgba(0,0,0,0.55)]', BADGE_SIZES[size], colorFor(seed), className)}>
      <Icon />
    </span>
  )
}
