import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CloudMoon, Coffee, Moon, Sparkles, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react'
import { personal } from '@/data/personal'

interface Slot {
  greeting: string
  icon: LucideIcon
  tint: string
  wishes: string[]
}

// Each part of the day has its own icon, colour and a few wishes; the wish changes daily so it never feels stuck.
function slotFor(hour: number): Slot {
  if (hour >= 5 && hour < 12)
    return {
      greeting: 'Good morning',
      icon: Sunrise,
      tint: 'from-amber-400 to-orange-600',
      wishes: ['Wishing you a bright and productive day ahead.', 'A fresh day, a fresh start. Make it count.', 'May today bring good news and steady gains.'],
    }
  if (hour >= 12 && hour < 17)
    return {
      greeting: 'Good afternoon',
      icon: Sun,
      tint: 'from-yellow-400 to-amber-600',
      wishes: ['Hope your day is going brilliantly.', 'Keep the momentum going. You are doing great.', 'Take a short break, then finish strong.'],
    }
  if (hour >= 17 && hour < 21)
    return {
      greeting: 'Good evening',
      icon: Sunset,
      tint: 'from-rose-400 to-fuchsia-600',
      wishes: ['Wishing you a calm and happy evening.', 'Well done today. Time to unwind.', 'Hope the day treated you well.'],
    }
  return {
    greeting: hour >= 21 ? 'Good night' : 'Working late',
    icon: hour >= 21 ? Moon : CloudMoon,
    tint: 'from-indigo-400 to-violet-600',
    wishes: ['Rest well and recharge for tomorrow.', 'Wishing you sweet dreams and a peaceful night.', 'Great effort today. Sleep well.'],
  }
}

const dayOfYear = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)

/** A friendly, time-aware hello with an icon, a daily wish and today's date. */
export function Greeting({ actions }: { actions?: ReactNode }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const slot = slotFor(now.getHours())
  const Icon = slot.icon
  const wish = slot.wishes[dayOfYear(now) % slot.wishes.length]
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/15 via-surface-3 to-transparent p-6 sm:p-7" aria-label="Greeting">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-4">
        <motion.span
          animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg shadow-black/25 ring-1 ring-white/20 sm:h-16 sm:w-16 ${slot.tint}`}
        >
          <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-text sm:text-2xl">
            {slot.greeting}, <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">{personal.firstName}</span>
            <Sparkles className="ml-1.5 inline h-4 w-4 align-middle text-accent" aria-hidden />
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{wish}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 rounded-full border border-border bg-surface-5 px-3.5 py-2 text-xs font-medium text-text-secondary sm:flex">
          <Coffee className="h-4 w-4 text-accent" aria-hidden /> {date}
        </div>
      </div>
      <p className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-5 px-3 py-1.5 text-xs font-medium text-text-secondary sm:hidden"><Coffee className="h-3.5 w-3.5 text-accent" aria-hidden /> {date}</p>
      {actions && <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:flex sm:flex-wrap">{actions}</div>}
    </motion.section>
  )
}
