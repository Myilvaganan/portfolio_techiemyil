import type { ReactElement } from 'react'
import type { IconKind } from '@/lib/panchang/days'

// Line-art icons for the special days, drawn in the current colour: Nandhi for Pradosham, a lamp for Karthigai and
// Deepavali, the Vel for Murugan days, Vinayagar for Chathurthi, the lingam for Sivarathiri, the namam for Perumal days,
// a pongal pot, a cow for Mattu Pongal, and the moon phases.

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ART: Record<IconKind, ReactElement> = {
  // Seated Nandhi facing left: body, folded legs, hump, head with horns and ear, a bell on the neck.
  nandi: (
    <g {...P}>
      <path d="M6 19.5h13.5" />
      <path d="M8.2 19.3c-.6-2.6.2-5 2.3-6.2 1.6-.9 3.6-.9 5.6-.4 1.9.5 3.2 2 3.3 3.8.1 1.3-.3 2.2-1 2.8" />
      <path d="M11.2 13c-.2-1.2.2-2.2 1.2-2.7" />
      <path d="M8.6 14.2c-1.3-.3-2.5-1.1-3-2.3-.4-.9-.2-1.9.6-2.5l1.4-1 1.6.3c.9.2 1.4 1 1.3 1.9" />
      <path d="M6.2 8.6c-.9-.9-1.2-2-.8-2.9M8.8 8.6c.6-1 1.5-1.6 2.6-1.6" />
      <path d="M5.4 10.2l-1.3.5" />
      <circle cx="9.6" cy="15.6" r=".7" fill="currentColor" />
      <path d="M13.5 19.3c.2-1.2 1.2-1.9 2.4-1.8" />
    </g>
  ),
  fullMoon: (
    <g {...P}>
      <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity=".18" />
      <circle cx="9.5" cy="10" r="1" />
      <circle cx="14" cy="14.5" r="1.4" />
    </g>
  ),
  newMoon: (
    <g {...P}>
      <circle cx="12" cy="12" r="7" strokeDasharray="2 2.2" />
      <path d="M15.5 6.5a6.5 6.5 0 1 0 0 11 7.5 7.5 0 0 1 0-11z" fill="currentColor" fillOpacity=".25" />
    </g>
  ),
  // Agal vilakku: a clay lamp with its flame.
  lamp: (
    <g {...P}>
      <path d="M4 14.5c1.5 2.8 4.5 4.3 8 4.3s6.5-1.5 8-4.3H4z" fill="currentColor" fillOpacity=".15" />
      <path d="M20 14.5l1.8-1.2" />
      <path d="M12 12.5c-1.6-1.2-1.9-3.1-.8-4.8.4-.7 1-1.3 1-2.2 1.6 1.2 2.4 3 1.9 4.7-.3 1.1-1.1 1.8-2.1 2.3z" fill="currentColor" fillOpacity=".35" />
      <path d="M10 21h4" />
    </g>
  ),
  // The Vel: a tall spear with a leaf-shaped head.
  vel: (
    <g {...P}>
      <path d="M12 2.5c2.6 2.4 3.6 4.8 3 7-.4 1.6-1.6 2.6-3 3-1.4-.4-2.6-1.4-3-3-.6-2.2.4-4.6 3-7z" fill="currentColor" fillOpacity=".18" />
      <path d="M12 12.5V21.5" />
      <path d="M10 14.5h4M10.5 16.2h3" />
    </g>
  ),
  // Vinayagar: the elephant head with ears and a curling trunk.
  ganesha: (
    <g {...P}>
      <path d="M12 4.5c3 0 5 2.2 5 5 0 1.7-.8 3.1-2 4" />
      <path d="M12 4.5c-3 0-5 2.2-5 5 0 1.7.8 3.1 2 4" />
      <path d="M7.2 7.3C5 6.6 3.4 8 3.6 10.3c.2 2 1.9 3.1 3.6 2.7M16.8 7.3c2.2-.7 3.8.7 3.6 3-.2 2-1.9 3.1-3.6 2.7" />
      <path d="M12 9.5v5.2c0 2 1.2 3.4 2.8 3.4 1 0 1.6-.7 1.4-1.6" />
      <circle cx="10.2" cy="9.2" r=".6" fill="currentColor" />
      <circle cx="13.8" cy="9.2" r=".6" fill="currentColor" />
      <path d="M9.5 3.5l2.5-1.5 2.5 1.5" />
    </g>
  ),
  // Shiva lingam on its base, with three lines of vibhuti.
  lingam: (
    <g {...P}>
      <path d="M9 15.5V9.8a3 3 0 0 1 6 0v5.7" fill="currentColor" fillOpacity=".15" />
      <path d="M4.5 15.5h12.2c1.2 0 2.3.6 2.8 1.6H6.3c-1 0-1.8-.7-1.8-1.6z" />
      <path d="M6 17.1l1 3h10l1-3" />
      <path d="M10 10.2h4M10 11.5h4M10 12.8h4" />
    </g>
  ),
  // Thiruman namam: the white U with the red line in the middle.
  namam: (
    <g {...P}>
      <path d="M7.5 4.5v8c0 3 2 5 4.5 5s4.5-2 4.5-5v-8" />
      <path d="M12 6.5v8" strokeWidth="2.4" />
      <path d="M10 20h4" />
    </g>
  ),
  // Pongal pot boiling over, with sugarcane.
  pongal: (
    <g {...P}>
      <path d="M6.5 11.5h11c.3 4.5-2.2 8-5.5 8s-5.8-3.5-5.5-8z" fill="currentColor" fillOpacity=".15" />
      <path d="M7 11.5c.2-1.4 1.5-1.8 2.5-1.2.8-1.2 2.6-1.4 3.6-.3 1-.8 2.7-.4 3.2 1" />
      <path d="M9.5 6c.5.6.5 1.4 0 2M12 5c.5.7.5 1.6 0 2.4M14.5 6c.5.6.5 1.4 0 2" />
      <path d="M20 21L18 4.5M18.6 9l1.1-.2M19.2 13.5l1-.2" />
    </g>
  ),
  cow: (
    <g {...P}>
      <path d="M5 9.5c-.8-1.5-.6-3 .6-3.6M19 9.5c.8-1.5.6-3-.6-3.6" />
      <path d="M7 9c0-1.4 2.2-2.4 5-2.4S17 7.6 17 9v4.5c0 3-2.2 5.5-5 5.5s-5-2.5-5-5.5V9z" fill="currentColor" fillOpacity=".12" />
      <path d="M9.5 16.5c.8.6 1.6.9 2.5.9s1.7-.3 2.5-.9" />
      <circle cx="9.8" cy="11.2" r=".6" fill="currentColor" />
      <circle cx="14.2" cy="11.2" r=".6" fill="currentColor" />
      <path d="M12 19v2.2" />
      <circle cx="12" cy="21.6" r=".6" fill="currentColor" />
    </g>
  ),
  sun: (
    <g {...P}>
      <circle cx="12" cy="13" r="4" fill="currentColor" fillOpacity=".2" />
      <path d="M12 4v2M4.9 7l1.4 1.4M19.1 7l-1.4 1.4M3 13h2M19 13h2M7 20h10" />
    </g>
  ),
  river: (
    <g {...P}>
      <path d="M3 9c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 13.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
    </g>
  ),
  // Amman: a crown over a face with the kumkum dot.
  devi: (
    <g {...P}>
      <path d="M7 9l1.2-4 2 2.4L12 3.5l1.8 3.9 2-2.4L17 9z" fill="currentColor" fillOpacity=".2" />
      <circle cx="12" cy="14" r="4.5" />
      <circle cx="12" cy="12.6" r=".7" fill="currentColor" />
      <path d="M10.3 15.8c1 .7 2.4.7 3.4 0" />
    </g>
  ),
  flag: (
    <g {...P}>
      <path d="M6 21V3.5" />
      <path d="M6 4.5h12v3.2H6zM6 7.7h12v3.2H6zM6 10.9h12v3.2H6z" />
      <circle cx="12" cy="9.3" r="1.1" />
    </g>
  ),
  kolam: (
    <g {...P}>
      <path d="M12 4l8 8-8 8-8-8z" />
      <path d="M12 8l4 4-4 4-4-4z" />
      <circle cx="12" cy="12" r=".7" fill="currentColor" />
      <circle cx="12" cy="2.6" r=".5" fill="currentColor" />
      <circle cx="21.4" cy="12" r=".5" fill="currentColor" />
      <circle cx="12" cy="21.4" r=".5" fill="currentColor" />
      <circle cx="2.6" cy="12" r=".5" fill="currentColor" />
    </g>
  ),
}

export function FestiveIcon({ kind, className }: { kind: IconKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      {ART[kind]}
    </svg>
  )
}

/** Each icon's colour, so the month view reads at a glance. */
export const ICON_TONE: Record<IconKind, string> = {
  nandi: 'text-amber-500',
  fullMoon: 'text-sky-400',
  newMoon: 'text-slate-400',
  lamp: 'text-orange-500',
  vel: 'text-rose-500',
  ganesha: 'text-orange-400',
  lingam: 'text-indigo-400',
  namam: 'text-red-500',
  pongal: 'text-amber-600',
  cow: 'text-emerald-500',
  sun: 'text-yellow-500',
  river: 'text-cyan-500',
  devi: 'text-pink-500',
  flag: 'text-emerald-600',
  kolam: 'text-fuchsia-500',
}
