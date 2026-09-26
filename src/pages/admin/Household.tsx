import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageBadge } from '@/components/admin/AdminShell'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bike, Building2, Car, ChevronDown, Flame, Fuel, Home, Loader2, ShoppingBag, ShoppingBasket, UtensilsCrossed, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Donut } from '@/components/viz/charts'
import { HideNumbersButton } from '@/components/journal/chrome'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { fetchStatements } from '@/lib/statementsApi'
import { todayStr } from '@/lib/journal'
import { GROUP, GROUPS, groupStats, householdTxns, lastMonths, monthKey, nextRentDue, type GroupStats, type HouseGroup, type HouseTxn, type Section } from '@/lib/household'

const ICONS: Record<HouseGroup, LucideIcon> = {
  rentSalem: Home,
  rentBengaluru: Building2,
  rentOther: Home,
  electricity: Zap,
  cookingGas: Flame,
  fuel: Fuel,
  bikeService: Wrench,
  food: UtensilsCrossed,
  quickCommerce: ShoppingBasket,
  rides: Car,
  shopping: ShoppingBag,
}

const SECTIONS: { id: Section; title: string; icon: LucideIcon }[] = [
  { id: 'home', title: 'Home & bills', icon: Home },
  { id: 'bike', title: 'Bike', icon: Bike },
  { id: 'lifestyle', title: 'Apps & shopping', icon: ShoppingBag },
]

const RANGES = [
  { id: 1, label: 'This month' },
  { id: 3, label: '3 months' },
  { id: 6, label: '6 months' },
  { id: 12, label: '12 months' },
  { id: 24, label: '2 years' },
] as const

const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function MiniBars({ values, months, color, format }: { values: number[]; months: string[]; color: string; format: (n: number) => string }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-9 items-end gap-[3px]" role="img" aria-label="Monthly spend">
      {values.map((v, i) => (
        <div key={months[i]} className="group relative flex h-full flex-1 flex-col justify-end" title={`${monthShort(months[i])}: ${format(v)}`}>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${v > 0 ? Math.max(6, (v / max) * 100) : 3}%` }}
            transition={{ duration: 0.5, delay: i * 0.02 }}
            className={cn('rounded-sm', v > 0 ? 'opacity-80 group-hover:opacity-100' : 'bg-border')}
            style={v > 0 ? { background: color } : undefined}
          />
        </div>
      ))}
    </div>
  )
}

function PaidStrip({ paid, months }: { paid: boolean[]; months: string[] }) {
  return (
    <div className="flex gap-1" aria-label="Months paid">
      {paid.map((p, i) => (
        <span
          key={months[i]}
          title={`${monthShort(months[i])} ${months[i].slice(0, 4)}: ${p ? 'paid' : 'no payment found'}`}
          className={cn('flex h-5 flex-1 items-center justify-center rounded text-2xs font-semibold uppercase', p ? 'bg-positive/20 text-positive' : 'bg-error/10 text-error/70')}
        >
          {monthShort(months[i]).slice(0, 1)}
        </span>
      ))}
    </div>
  )
}

function Delta({ now, before }: { now: number; before: number }) {
  const m = useMoney()
  if (!before && !now) return null
  if (!before) return <span className="text-2xs text-text-secondary">new this month</span>
  const pct = ((now - before) / before) * 100
  const up = pct > 0
  return (
    <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-2xs font-semibold', Math.abs(pct) < 1 ? 'bg-surface-3 text-text-secondary' : up ? 'bg-error/10 text-error' : 'bg-positive/10 text-positive')}>
      {m.hidden ? '•••' : `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`}
    </span>
  )
}

function GroupCard({ s, trend, trendMonths, single, active, onOpen }: { s: GroupStats; trend: GroupStats; trendMonths: string[]; single: boolean; active: boolean; onOpen: () => void }) {
  const m = useMoney()
  const g = GROUP[s.id]
  const Icon = ICONS[s.id]
  const empty = s.count === 0
  const due = g.monthly ? nextRentDue(s.last) : null
  const brandTotal = s.brands.reduce((t, b) => t + b.total, 0) || 1

  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={onOpen}
      aria-expanded={active}
      className={cn('group relative text-left rounded-[20px] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent', active && 'ring-2 ring-accent/60')}
    >
      <GlassCard hover={false} className="relative h-full overflow-hidden p-3.5">
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: g.color }} />
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${g.color} 18%, transparent)`, color: g.color }}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{g.label}</p>
              <p className="truncate text-2xs text-text-secondary">{g.hint}</p>
            </div>
          </div>
          {!g.monthly && <Delta now={s.thisMonth} before={s.lastMonth} />}
        </div>

        {empty ? (
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            {s.last ? (
              <>
                Nothing in this period. Last paid <span className="text-text">{dayLabel(s.last.date)}</span> · {m.inr(s.last.amount)}.
              </>
            ) : (
              <>
                Nothing found yet.{s.id === 'electricity' ? ' Bills paid through Amazon Pay, CRED or cash won’t show here.' : ''}{' '}
                <Link to="/admin/bank-statements" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                  Add statements
                </Link>
              </>
            )}
          </p>
        ) : (
          <>
            <div className="mt-2.5 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-semibold leading-tight text-text">{m.inr(s.total)}</p>
                <p className="text-2xs text-text-secondary">
                  {s.count} payment{s.count === 1 ? '' : 's'}
                  {!single && <> · {m.inr(s.avgMonth)}/mo avg</>}
                </p>
              </div>
              <div className="text-right">
                <p className="label-caps">This month</p>
                <p className="font-mono text-sm font-semibold text-text">{m.inr(s.thisMonth)}</p>
              </div>
            </div>

            <div className="mt-2.5">{g.monthly ? <PaidStrip paid={trend.paid} months={trendMonths} /> : <MiniBars values={trend.byMonth} months={trendMonths} color={g.color} format={(n) => m.inr(n)} />}</div>

            {g.monthly ? (
              <p className="mt-2.5 text-2xs text-text-secondary">
                Last paid <span className="text-text">{s.last ? `${dayLabel(s.last.date)} · ${m.inr(s.last.amount)}` : '—'}</span>
                {due && (
                  <>
                    {' '}
                    · next around <span className={cn(due < todayStr() ? 'text-error' : 'text-text')}>{dayLabel(due)}</span>
                  </>
                )}
              </p>
            ) : (
              s.brands.length > 0 && (
                <div className="mt-2.5 space-y-1">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
                    {s.brands.slice(0, 4).map((b, i) => (
                      <span key={b.brand} style={{ width: `${(b.total / brandTotal) * 100}%`, background: g.color, opacity: 1 - i * 0.22 }} />
                    ))}
                  </div>
                  <p className="truncate text-2xs text-text-secondary">
                    {s.brands.slice(0, 3).map((b, i) => (
                      <span key={b.brand}>
                        {i > 0 && ' · '}
                        <span className="text-text">{b.brand}</span> {m.hidden ? '' : `${Math.round((b.total / brandTotal) * 100)}%`}
                      </span>
                    ))}
                  </p>
                </div>
              )
            )}
          </>
        )}
      </GlassCard>
    </button>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: ReactNode; accent?: string }) {
  return (
    <GlassCard hover={false} className="relative overflow-hidden px-4 py-2.5">
      {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />}
      <p className="label-caps">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-semibold text-text">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

function Details({ group, txns, months, onClose }: { group: HouseGroup; txns: HouseTxn[]; months: string[]; onClose: () => void }) {
  const m = useMoney()
  const g = GROUP[group]
  const inRange = new Set(months)
  const list = txns.filter((t) => t.group === group && inRange.has(monthKey(t.date))).reverse()
  return (
    <GlassCard hover={false} className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="card-title">
          {g.label} <span className="font-normal text-text-secondary">· {list.length} transactions</span>
        </h3>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-text-secondary hover:text-text">
          Close <ChevronDown className="h-3.5 w-3.5 rotate-180" />
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-text-secondary">No transactions in this period.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border label-caps">
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Paid to</th>
                <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">Details</th>
                <th scope="col" className="py-2 pr-3 font-medium">From</th>
                <th scope="col" className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-text-secondary">{t.date}</td>
                  <td className="py-2 pr-3 text-text">{t.brand}</td>
                  <td className="hidden max-w-[28rem] truncate py-2 pr-3 font-mono text-2xs text-text-secondary sm:table-cell">{t.description}</td>
                  <td className="py-2 pr-3 capitalize text-text-secondary">{t.source}</td>
                  <td className={cn('py-2 text-right font-mono font-semibold', t.amount < 0 ? 'text-positive' : 'text-text')}>{t.amount < 0 ? `+${m.inr(-t.amount)}` : m.inr(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}

/** Where the household money goes: both rented houses, bills, the bike, and the delivery and shopping apps. */
export function Household() {
  const m = useMoney()
  const [txns, setTxns] = useState<HouseTxn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<number>(1)
  const [open, setOpen] = useState<HouseGroup | null>(null)
  const [section, setSection] = useState<Section | 'all'>('all')
  const current = todayStr().slice(0, 7)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchStatements('bank'), fetchStatements('card')])
      .then(([bank, card]) => !cancelled && setTxns(householdTxns(bank.transactions, card.transactions)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your statements.'))
    return () => {
      cancelled = true
    }
  }, [])

  const months = useMemo(() => lastMonths(current, range), [current, range])
  // The cards' little charts always show at least the last six months, even when the totals cover only this month.
  const trendMonths = useMemo(() => lastMonths(current, Math.max(range, 6)), [current, range])
  const stats = useMemo(() => (txns ? groupStats(txns, months, current) : []), [txns, months, current])
  const trendStats = useMemo(() => (txns ? groupStats(txns, trendMonths, current) : []), [txns, trendMonths, current])
  const by = (ids: HouseGroup[]) => stats.filter((s) => ids.includes(s.id))
  const sum = (list: GroupStats[], k: 'total' | 'thisMonth' | 'lastMonth') => list.reduce((t, s) => t + s[k], 0)

  const rent = by(['rentSalem', 'rentBengaluru', 'rentOther'])
  const bills = by(['electricity', 'cookingGas'])
  const bike = by(['fuel', 'bikeService'])
  const apps = by(['food', 'quickCommerce', 'rides', 'shopping'])
  const total = sum(stats, 'total')
  const slices = stats.filter((s) => s.total > 0).map((s) => ({ label: GROUP[s.id].label, value: s.total, color: GROUP[s.id].color }))
  const latest = txns?.[txns.length - 1]?.date

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <PageBadge />
          <div className="min-w-0">
          <p className="page-eyebrow">Home &amp; living</p>
          <h1 className="mt-1 page-title">Household</h1>
          <p className="page-lede">
            Rent for both houses, electricity and gas, the bike, and every delivery and shopping app — read from your bank and card statements.
            {latest && <> Statements up to {dayLabel(latest)}.</>}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Period" className="inline-flex rounded-full border border-border bg-surface-2 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={cn('rounded-full px-3 py-1.5 transition-colors', range === r.id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}
              >
                {r.label}
              </button>
            ))}
          </div>
          <HideNumbersButton />
        </div>
      </div>

      {error ? (
        <GlassCard hover={false} className="p-6 text-sm text-error" role="alert">
          {error}
        </GlassCard>
      ) : !txns ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your statements…
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5 [&>*:first-child]:col-span-2 xl:[&>*:first-child]:col-span-1">
            <Kpi label={range === 1 ? 'Household · this month' : `Household · ${range} months`} value={m.inr(total)} sub={range === 1 ? <>{m.inr(sum(stats, 'lastMonth'))} last month</> : <>{m.inr(total / range)} a month on average</>} accent="var(--color-accent)" />
            <Kpi label="Rent" value={m.inr(sum(rent, 'total'))} sub={<>This month {m.inr(sum(rent, 'thisMonth'))}</>} accent="var(--viz-1)" />
            <Kpi label="Bills" value={m.inr(sum(bills, 'total'))} sub="Electricity + cooking gas" accent="var(--viz-2)" />
            <Kpi label="Bike" value={m.inr(sum(bike, 'total'))} sub="Petrol + service" accent="var(--viz-6)" />
            <Kpi label="Apps & shopping" value={m.inr(sum(apps, 'total'))} sub={<>This month {m.inr(sum(apps, 'thisMonth'))} · last {m.inr(sum(apps, 'lastMonth'))}</>} accent="var(--viz-8)" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
                {([{ id: 'all', title: 'Everything', icon: Home }, ...SECTIONS] as const).map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    aria-pressed={section === sec.id}
                    onClick={() => setSection(sec.id)}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors', section === sec.id ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text')}
                  >
                    <sec.icon className="h-3.5 w-3.5" /> {sec.title}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {GROUPS.filter((g) => section === 'all' || g.section === section)
                  .map((g) => stats.find((s) => s.id === g.id)!)
                  .filter((s) => s.id !== 'rentOther' || s.count > 0)
                  .map((s) => (
                    <GroupCard key={s.id} s={s} trend={trendStats.find((t) => t.id === s.id)!} trendMonths={trendMonths} single={range === 1} active={open === s.id} onOpen={() => setOpen(open === s.id ? null : s.id)} />
                  ))}
              </div>
              {open && <Details group={open} txns={txns} months={months} onClose={() => setOpen(null)} />}
            </div>

            <GlassCard hover={false} className="h-fit p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <h2 className="mb-3 label-caps">Where it goes</h2>
              {slices.length === 0 ? (
                <EmptyState icon={Home} title="No household spending" hint="Nothing found in this period. Try a longer range." className="py-6" />
              ) : (
                <>
                  <div className="flex justify-center">
                    <Donut slices={slices} centerLabel={m.inr(total)} format={(n) => m.inr(n)} size={160} />
                  </div>
                  <ul className="mt-3 space-y-1.5 text-xs">
                    {[...slices]
                      .sort((a, b) => b.value - a.value)
                      .map((s) => (
                        <li key={s.label} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                            <span className="truncate text-text">{s.label}</span>
                          </span>
                          <span className="font-mono text-text-secondary">
                            {m.hidden ? '•••' : `${Math.round((s.value / total) * 100)}%`} · {m.inr(s.value)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
              <p className="mt-4 border-t border-border pt-3 text-2xs leading-relaxed text-text-secondary">
                Salem rent is anything paid to Appusamy; Bengaluru rent is anything paid to Visalakshi. Card bill payments, EMIs and surcharges are left out so nothing is counted twice.
              </p>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  )
}
