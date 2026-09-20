import type { Fill } from './optionsAnalytics'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UNDERLYINGS = [
  { name: 'NIFTY', lot: 75, atm: 24500, step: 50, premium: 120 },
  { name: 'BANKNIFTY', lot: 30, atm: 52000, step: 100, premium: 300 },
  { name: 'FINNIFTY', lot: 65, atm: 23800, step: 50, premium: 90 },
]

const pad = (n: number) => String(n).padStart(2, '0')

// Deterministic made-up trades so the analytics can be previewed without a Console export.
export function demoFills(): Fill[] {
  const rand = rng(42)
  const fills: Fill[] = []
  let n = 0
  const start = Date.UTC(2026, 2, 2)
  for (let d = 0; d < 200; d++) {
    const dayMs = start + d * 86_400_000
    const day = new Date(dayMs)
    const wd = day.getUTCDay()
    if (wd === 0 || wd === 6) continue
    const trades = Math.floor(rand() * 4)
    for (let i = 0; i < trades; i++) {
      const u = UNDERLYINGS[Math.floor(rand() * UNDERLYINGS.length)]
      const type = rand() < 0.5 ? 'CE' : 'PE'
      const strike = u.atm + Math.round((rand() - 0.5) * 6) * u.step
      const expiryMs = dayMs + ((2 - wd + 7) % 7) * 86_400_000
      const e = new Date(expiryMs)
      const symbol = `${u.name}${String(e.getUTCFullYear()).slice(2)}${e.getUTCMonth() + 1 > 9 ? 'OND'[e.getUTCMonth() - 9] : e.getUTCMonth() + 1}${pad(e.getUTCDate())}${strike}${type}`
      const buying = rand() < 0.7
      const hour = 9 + Math.floor(rand() * 6)
      const min = (hour === 9 ? 20 : 0) + Math.floor(rand() * (hour === 9 ? 39 : 60))
      const holdMin = 3 + Math.floor(rand() * 200)
      const entry = Math.round(u.premium * (0.3 + rand() * 1.4) * 20) / 20
      const lateBias = hour >= 13 ? -0.06 : 0.02
      const ret = (rand() - 0.5) * 0.9 + (buying ? -0.02 : 0.03) + lateBias + (rand() < 0.08 ? 0.9 : 0)
      const exit = Math.max(0.05, Math.round(entry * (1 + (buying ? ret : -ret)) * 20) / 20)
      const qty = u.lot * (1 + Math.floor(rand() * 3))
      const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
      const at = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(Math.floor(rand() * 60))}`
      const openM = hour * 60 + min
      const closeM = Math.min(openM + holdMin, 15 * 60 + 25)
      const mk = (side: 'BUY' | 'SELL', price: number, minutes: number, q: number): Fill => {
        n++
        const time = at(minutes)
        return { id: `T${n}`, orderId: `O${n}`, symbol, side, qty: q, price, date, time, ts: Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), Number(time.slice(0, 2)), Number(time.slice(3, 5)), Number(time.slice(6, 8))) }
      }
      fills.push(mk(buying ? 'BUY' : 'SELL', entry, openM, qty))
      fills.push(mk(buying ? 'SELL' : 'BUY', exit, closeM, qty))
    }
  }
  return fills.sort((a, b) => a.ts - b.ts)
}
