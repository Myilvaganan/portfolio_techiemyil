import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useInViewOnce } from './motion'
import { FitValue } from './FitValue'

export const vizColor = (i: number, isOther = false) => (isOther ? 'var(--viz-other)' : `var(--viz-${(i % 8) + 1})`)

const compact = (n: number) => {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1e7) return `${sign}${(a / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${sign}${(a / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `${sign}${Math.round(a)}`
}

// Measures the container so SVG charts draw at real pixel size (crisp text) instead of scaling a fixed viewBox.
function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(el.clientWidth, 260))
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function Tooltip({ leftPct, children }: { leftPct: number; children: ReactNode }) {
  const flip = leftPct > 62
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: `${leftPct}%`, transform: `translateX(${flip ? '-105%' : '8%'})` }}
    >
      {children}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

// ---------- Area / line ----------

export interface AreaSeries {
  key: string
  label: string
  color: string
  values: number[]
}

export function AreaChart({ labels, series, height = 230, format, axisFormat = compact }: { labels: string[]; series: AreaSeries[]; height?: number; format: (n: number) => string; axisFormat?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const { ref, width: W } = useWidth<HTMLDivElement>()
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const PX = 6
  const PR = 40
  const PT = 14
  const PB = 8
  const all = series.flatMap((s) => s.values)
  const min = Math.min(0, ...all)
  const max = Math.max(1, ...all)
  const span = max - min || 1
  const n = labels.length
  const x = (i: number) => PX + (n <= 1 ? 0.5 : i / (n - 1)) * (W - PX - PR)
  const y = (v: number) => PT + ((max - v) / span) * (height - PT - PB)
  const paths = useMemo(
    () =>
      series.map((s) => {
        const line = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
        return { s, line, area: `${line} L${x(n - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z` }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, labels, height, W],
  )
  if (n === 0) return <p className="py-10 text-center text-sm text-text-secondary">No data yet.</p>
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => min + span * f)
  return (
    <div ref={ref} className="relative">
      {hover !== null && (
        <Tooltip leftPct={(x(hover) / W) * 100}>
          <p className="mb-1 font-medium text-text">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-3 text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-mono text-text">{format(s.values[hover])}</span>
            </p>
          ))}
        </Tooltip>
      )}
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full touch-none"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
        }}
      >
        {grid.map((g) => (
          <g key={g}>
            <line x1={PX} x2={W - PR + 4} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-border" strokeDasharray={g === 0 ? undefined : '3 5'} />
            <text x={W - 2} y={y(g) + 4} textAnchor="end" className="fill-text-secondary/80" fontSize={11}>
              {axisFormat(g)}
            </text>
          </g>
        ))}
        {paths.map(({ s, line, area }, i) => (
          <g key={s.key}>
            <motion.path d={area} fill={s.color} initial={reduce ? false : { opacity: 0 }} animate={inView ? { opacity: series.length > 1 ? 0.08 : 0.16 } : {}} transition={{ duration: 0.9, delay: 0.4 + i * 0.1 }} />
            <motion.path
              d={line}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.3, delay: i * 0.12, ease: 'easeInOut' }}
            />
          </g>
        ))}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PT} y2={height - PB} stroke="currentColor" className="text-text-secondary/40" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--color-card)" strokeWidth={2} />
            ))}
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-text-secondary">
        <span>{labels[0]}</span>
        <span>{labels[n - 1]}</span>
      </div>
    </div>
  )
}

// ---------- Grouped / stacked bars (+ optional line) ----------

export interface BarSeries {
  key: string
  label: string
  color: string
  values: number[]
}

export function BarChart({
  labels,
  bars,
  line,
  stacked = false,
  height = 250,
  format,
  axisFormat = compact,
}: {
  labels: string[]
  bars: BarSeries[]
  line?: { label: string; color: string; values: number[] }
  stacked?: boolean
  height?: number
  format: (n: number) => string
  axisFormat?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const { ref, width: W } = useWidth<HTMLDivElement>()
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const PX = 8
  const PR = 40
  const PT = 12
  const PB = 24
  const n = labels.length
  if (n === 0) return <p className="py-10 text-center text-sm text-text-secondary">No data yet.</p>
  const totals = labels.map((_, i) => (stacked ? bars.reduce((s, b) => s + b.values[i], 0) : Math.max(...bars.map((b) => b.values[i]))))
  const max = Math.max(1, ...totals, ...(line?.values ?? []))
  const min = Math.min(0, ...(line?.values ?? []))
  const span = max - min
  const y = (v: number) => PT + ((max - v) / span) * (height - PT - PB)
  const slot = (W - PX - PR) / n
  const groupW = Math.min(slot * 0.72, 96)
  const barW = stacked ? groupW : groupW / bars.length
  const cx = (i: number) => PX + slot * i + slot / 2
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => min + span * f)
  // With many periods, label only every few so the axis stays readable and thin bars don't grow round dots.
  const labelStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - PX - PR) / 54))))
  const linePath = line ? line.values.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') : ''

  return (
    <div ref={ref} className="relative">
      {hover !== null && (
        <Tooltip leftPct={(cx(hover) / W) * 100}>
          <p className="mb-1 font-medium text-text">{labels[hover]}</p>
          {bars.map((b) => (
            <p key={b.key} className="flex items-center justify-between gap-3 text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: b.color }} />
                {b.label}
              </span>
              <span className="font-mono text-text">{format(b.values[hover])}</span>
            </p>
          ))}
          {line && (
            <p className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1 text-text-secondary">
              <span>{line.label}</span>
              <span className="font-mono text-text">{format(line.values[hover])}</span>
            </p>
          )}
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} role="img" aria-label={bars.map((b) => b.label).join(', ')} onMouseLeave={() => setHover(null)}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={PX} x2={W - PR + 4} y1={y(g)} y2={y(g)} stroke="currentColor" className="text-border" strokeDasharray={g === 0 ? undefined : '3 5'} />
            <text x={W - 2} y={y(g) + 4} textAnchor="end" className="fill-text-secondary/80" fontSize={11}>
              {axisFormat(g)}
            </text>
          </g>
        ))}
        {labels.map((label, i) => {
          let acc = 0
          return (
            <g key={label} onMouseEnter={() => setHover(i)}>
              <rect x={PX + slot * i} y={PT} width={slot} height={height - PT - PB} fill="transparent" />
              {hover === i && <rect x={PX + slot * i + 2} y={PT} width={slot - 4} height={height - PT - PB} rx={6} fill="currentColor" className="text-surface-5" />}
              {bars.map((b, bi) => {
                const v = b.values[i]
                if (v <= 0) return null
                const top = stacked ? y(acc + v) : y(v)
                const bottom = stacked ? y(acc) : y(0)
                const bx = stacked ? cx(i) - groupW / 2 : cx(i) - groupW / 2 + bi * barW
                acc += v
                return (
                  <motion.rect
                    key={b.key}
                    x={bx + (stacked ? 0 : 1)}
                    y={top}
                    width={Math.max(barW - (stacked ? 0 : 2), 2)}
                    height={Math.max(bottom - top - (stacked && bi > 0 ? 1.5 : 0), 1)}
                    rx={Math.min(3, Math.max(barW / 2 - 0.5, 0))}
                    fill={b.color}
                    style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={inView ? { scaleY: 1 } : {}}
                    transition={{ duration: 0.7, delay: i * 0.05 + bi * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )
              })}
              {i % labelStep === 0 && (
                <text x={Math.min(Math.max(cx(i), PX + 18), W - PR - 18)} y={height - 7} textAnchor="middle" className="fill-text-secondary" fontSize={n > 9 ? 10 : 11.5}>
                  {label}
                </text>
              )}
            </g>
          )
        })}
        {line && (
          <>
            <motion.path
              d={linePath}
              fill="none"
              stroke={line.color}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : {}}
              transition={{ duration: 1.2, delay: 0.5 }}
            />
            {n <= 24 &&
              line.values.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={3.5} fill={line.color} stroke="var(--color-card)" strokeWidth={1.5} />)}
          </>
        )}
      </svg>
    </div>
  )
}

// ---------- Donut ----------

export interface DonutSlice {
  label: string
  value: number
  color: string
}

export function Donut({ slices, centerLabel, format, size = 190 }: { slices: DonutSlice[]; centerLabel: string; format: (n: number) => string; size?: number }) {
  const [active, setActive] = useState<number | null>(null)
  const { ref, inView } = useInViewOnce<HTMLDivElement>()
  const reduce = useReducedMotion()
  const total = slices.reduce((s, x) => s + x.value, 0)
  const R = 70
  const C = 2 * Math.PI * R
  let offset = 0
  const shown = active !== null ? slices[active] : null
  return (
    <div ref={ref} className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={`${centerLabel} breakdown`}>
        <circle cx={90} cy={90} r={R} fill="none" stroke="currentColor" className="text-surface-5" strokeWidth={20} />
        {slices.map((s, i) => {
          const len = total ? (s.value / total) * C : 0
          const gap = slices.length > 1 ? 2 : 0
          const dash = Math.max(len - gap, 0)
          const el = (
            <motion.circle
              key={s.label}
              cx={90}
              cy={90}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={active === i ? 24 : 20}
              strokeDashoffset={-offset}
              initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
              animate={inView ? { strokeDasharray: `${dash} ${C - dash}` } : {}}
              transition={{ duration: 0.9, delay: i * 0.08, ease: 'easeOut' }}
              opacity={active === null || active === i ? 1 : 0.35}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{ cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s' }}
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="max-w-[12ch] truncate text-[11px] text-text-secondary">{shown ? shown.label : centerLabel}</span>
        <div style={{ width: size * 0.56 }}>
          <FitValue max={18} min={9} text={format(shown ? shown.value : total)} className="whitespace-nowrap text-center font-mono font-semibold leading-tight text-text">
            {format(shown ? shown.value : total)}
          </FitValue>
        </div>
        {shown && <span className="text-[11px] text-text-secondary">{((shown.value / (total || 1)) * 100).toFixed(1)}%</span>}
      </div>
    </div>
  )
}

// ---------- Ranked horizontal bars ----------

export function HBars({ items, format, onPick }: { items: { label: string; value: number; sub?: string; color?: string }[]; format: (n: number) => string; onPick?: (label: string) => void }) {
  const { ref, inView } = useInViewOnce<HTMLUListElement>()
  const reduce = useReducedMotion()
  const max = Math.max(1, ...items.map((i) => i.value))
  if (items.length === 0) return <p className="py-6 text-center text-sm text-text-secondary">Nothing to show yet.</p>
  return (
    <ul ref={ref} className="space-y-3">
      {items.map((it, i) => (
        <li key={it.label} className={cn('text-xs', onPick && 'cursor-pointer')} onClick={() => onPick?.(it.label)}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-text">{it.label}</span>
            <span className="shrink-0 font-mono text-text">{format(it.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-5">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? vizColor(0) }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          {it.sub && <p className="mt-0.5 text-[11px] text-text-secondary">{it.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

// ---------- Calendar heatmap (one hue, more spend = stronger) ----------

export function CalendarHeatmap({ values, format }: { values: Map<string, number>; format: (n: number) => string }) {
  const [hover, setHover] = useState<string | null>(null)
  const { ref, inView } = useInViewOnce<HTMLDivElement>()
  const dates = [...values.keys()].sort()
  if (dates.length === 0) return <p className="py-6 text-center text-sm text-text-secondary">No spending days yet.</p>
  const start = new Date(`${dates[0]}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const end = new Date(`${dates.at(-1)}T00:00:00Z`)
  const weeks: { date: string; inRange: boolean }[][] = []
  for (const d = new Date(start); d <= end; ) {
    const week: { date: string; inRange: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ date: d.toISOString().slice(0, 10), inRange: d <= end })
      d.setUTCDate(d.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  const max = Math.max(...values.values())
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)))
  const pct = [0, 22, 42, 68, 100]
  return (
    <div ref={ref}>
      <p className="mb-2 min-h-4 text-xs text-text-secondary">
        {hover ? (
          <>
            {new Date(`${hover}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} ·{' '}
            <span className="font-mono text-text">{format(values.get(hover) ?? 0)}</span>
          </>
        ) : (
          'Daily spend — darker means more'
        )}
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((c) => {
                const v = values.get(c.date) ?? 0
                const l = level(v)
                return (
                  <motion.span
                    key={c.date}
                    onMouseEnter={() => setHover(c.date)}
                    title={`${c.date}: ${format(v)}`}
                    className={cn('h-3 w-3 rounded-[3px]', !c.inRange && 'invisible')}
                    style={{ background: l === 0 ? 'var(--color-surface-7)' : `color-mix(in srgb, var(--viz-1) ${pct[l]}%, transparent)` }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.3, delay: Math.min(wi * 0.025, 0.8) }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-text-secondary">
        Less
        {pct.map((p, i) => (
          <span key={i} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i === 0 ? 'var(--color-surface-7)' : `color-mix(in srgb, var(--viz-1) ${p}%, transparent)` }} />
        ))}
        More
      </div>
    </div>
  )
}

// ---------- Gauge ----------

export function Gauge({ value, label, sub, size = 150, invert = false }: { value: number; label: string; sub?: string; size?: number; invert?: boolean }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>()
  const reduce = useReducedMotion()
  const v = Math.max(0, Math.min(100, value))
  // Utilisation is better when low; progress is better when high (invert).
  const score = invert ? 100 - v : v
  const tone = score < 30 ? 'var(--color-positive)' : score < 60 ? '#f59e0b' : 'var(--color-error)'
  const R = 62
  const arc = Math.PI * R
  return (
    <div ref={ref} className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 160 100" className="h-full w-full" role="img" aria-label={`${label} ${v.toFixed(0)}%`}>
        <path d="M18 88 A62 62 0 0 1 142 88" fill="none" stroke="currentColor" className="text-surface-7" strokeWidth={13} strokeLinecap="round" />
        <motion.path
          d="M18 88 A62 62 0 0 1 142 88"
          fill="none"
          stroke={tone}
          strokeWidth={13}
          strokeLinecap="round"
          strokeDasharray={arc}
          initial={reduce ? false : { strokeDashoffset: arc }}
          animate={inView ? { strokeDashoffset: arc * (1 - v / 100) } : {}}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-mono text-xl font-semibold text-text">{v.toFixed(0)}%</p>
        <p className="text-[11px] text-text-secondary">{sub ?? label}</p>
      </div>
    </div>
  )
}

export function Sparkline({ values, color = 'var(--viz-1)', height = 34 }: { values: number[]; color?: string; height?: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>()
  const reduce = useReducedMotion()
  if (values.length < 2) return null
  const W = 120
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * W).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(' ')
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} aria-hidden>
        <motion.path d={`${pts} L${W},${height} L0,${height} Z`} fill={color} initial={reduce ? false : { opacity: 0 }} animate={inView ? { opacity: 0.15 } : {}} transition={{ duration: 0.8, delay: 0.3 }} />
        <motion.path d={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}} transition={{ duration: 1 }} />
      </svg>
    </div>
  )
}
