import type { CSSProperties } from 'react'

// Colourful stat tiles, as on the Calories page, for every module: a gradient per tile, chosen by its tone when it has
// one (good = green, bad = red, warn = amber, gold = orange) and otherwise by its label, so the same tile keeps its
// colour across visits and neighbouring tiles differ.

const PALETTE = [
  ['#8b5cf6', '#6366f1'],
  ['#0ea5e9', '#2563eb'],
  ['#ec4899', '#f43f5e'],
  ['#14b8a6', '#059669'],
  ['#f97316', '#f59e0b'],
  ['#d946ef', '#9333ea'],
  ['#06b6d4', '#0284c7'],
  ['#6366f1', '#3b82f6'],
]
const TONES: Record<string, [string, string]> = {
  good: ['#10b981', '#0d9488'],
  bad: ['#f43f5e', '#dc2626'],
  warn: ['#f59e0b', '#ea580c'],
  gold: ['#f97316', '#f59e0b'],
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export type TileTone = 'good' | 'bad' | 'warn' | 'gold' | 'neutral' | undefined

/** Class and style that turn a card into a colour tile. */
export function tile(seed: string, tone?: TileTone): { className: string; style: CSSProperties } {
  const [a, b] = (tone && tone !== 'neutral' && TONES[tone]) || PALETTE[hash(seed) % PALETTE.length]
  return { className: 'color-tile', style: { '--tile-bg': `linear-gradient(135deg, ${a}, ${b})` } as CSSProperties }
}

/** Tone from a value's colour class (text-positive / text-error / text-amber…), for tiles that only pass a class. */
export const toneFromClass = (cls?: string): TileTone => (cls?.includes('positive') || cls?.includes('emerald') ? 'good' : cls?.includes('error') || cls?.includes('red') ? 'bad' : cls?.includes('amber') ? 'warn' : cls?.includes('accent') ? 'gold' : undefined)
