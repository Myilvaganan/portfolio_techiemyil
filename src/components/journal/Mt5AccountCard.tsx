import { useState, type ReactNode } from 'react'
import { ChevronDown, Globe, Upload } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { formatInr } from '@/lib/kite'
import type { Mt5Account } from '@/lib/journalStore'
import { MASK, useMoney } from '@/lib/privacy'
import { labelClass, tone } from './parts'

const stamp = (time: string) => (time ? new Date(`${time.slice(0, 10)}T${time.slice(11, 16) || '00:00'}:00Z`).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) : '')
const day = (date: string) => (date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')

// Broker-reported figures that are money (or reveal size). Ratios and counts stay visible in hidden mode.
const MONEY_LABELS = new Set([
  'Total Net Profit',
  'Gross Profit',
  'Gross Loss',
  'Expected Payoff',
  'Balance Drawdown Absolute',
  'Balance Drawdown Maximal',
  'Balance Drawdown Relative',
  'Largest profit trade',
  'Largest loss trade',
  'Average profit trade',
  'Average loss trade',
  'Maximum consecutive wins ($)',
  'Maximum consecutive losses ($)',
  'Maximal consecutive profit (count)',
  'Maximal consecutive loss (count)',
])

function Metric({ label, value, sub, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('truncate font-mono text-sm font-semibold text-text sm:text-base', valueClass)}>{value}</p>
      {sub && <p className="truncate font-mono text-2xs text-text-secondary/70">{sub}</p>}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-text-secondary">{children}</span>
}

interface Props {
  account: Mt5Account
  /** INR per 1 USD, for the small grey rupee equivalents. Only shown for dollar accounts. */
  usdInr: number
  onUpload: () => void
  /** One slim row (identity + balance + P&L) for screens where vertical space is tight, e.g. the dashboard tab. */
  compact?: boolean
}

export function Mt5AccountCard({ account, usdInr, onUpload, compact = false }: Props) {
  const m = useMoney()
  const [details, setDetails] = useState(false)

  const deposits = account.balanceOps.filter((o) => o.type === 'balance')
  const netDeposits = deposits.reduce((s, o) => s + o.amount, 0)
  // Balance minus what was paid in is the account's profit or loss to date, however many reports have been uploaded.
  const pnl = account.balance !== null ? account.balance - netDeposits : null
  const returnPct = pnl !== null && netDeposits > 0 ? (pnl / netDeposits) * 100 : null
  const inr = (n: number | null) => (n === null || account.currency !== 'USD' ? undefined : m.hidden ? `≈ ₹${MASK}` : `≈ ${formatInr(n * usdInr)}`)

  const summaryRows = Object.entries(account.summary)

  if (compact && !details) {
    return (
      <GlassCard hover={false} className="px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="h-4 w-4 shrink-0 text-accent" />
            <span className="truncate font-display text-sm font-semibold text-text">{account.name || 'MetaTrader 5 account'}</span>
            <span className="text-text-secondary">
              #<span className="font-mono text-text">{account.account}</span>
              {account.server && <> · {account.server}</>}
            </span>
          </span>
          <span className="text-text-secondary">
            Balance <span className="font-mono font-semibold text-text">{account.balance !== null ? m.inr(account.balance) : '—'}</span>
          </span>
          <span className="text-text-secondary">
            Equity <span className="font-mono font-semibold text-text">{account.equity !== null ? m.inr(account.equity) : '—'}</span>
          </span>
          <span className="text-text-secondary">
            P&amp;L to date <span className={cn('font-mono font-semibold', pnl !== null ? tone(pnl) : '')}>{pnl !== null ? m.signed(pnl) : '—'}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" magnetic={false} onClick={onUpload} className="!h-7 !px-3 !text-xs">
              <Upload className="h-3.5 w-3.5" /> Upload report
            </Button>
            <button
              type="button"
              data-cursor="hover"
              aria-expanded={false}
              onClick={() => setDetails(true)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
            >
              Details <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard hover={false} className="p-3 sm:p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Globe className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate font-display text-base font-semibold text-text">{account.name || 'MetaTrader 5 account'}</h2>
              {account.accountType && <Badge>{account.accountType}</Badge>}
              {account.currency && <Badge>{account.currency}</Badge>}
              {account.marginMode && <Badge>{account.marginMode}</Badge>}
            </div>
            <p className="truncate text-xs text-text-secondary">
              Account <span className="font-mono text-text">{account.account}</span>
              {account.server && <> · {account.server}</>}
            </p>
            {account.company && <p className="truncate text-2xs text-text-secondary/80">{account.company}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Balance" value={account.balance !== null ? m.inr(account.balance) : '—'} sub={inr(account.balance)} />
          <Metric label="Equity" value={account.equity !== null ? m.inr(account.equity) : '—'} sub={inr(account.equity)} />
          <Metric label="Deposited" value={m.inr(netDeposits)} sub={`${deposits.length} ${deposits.length === 1 ? 'entry' : 'entries'}`} />
          <Metric
            label="P&L to date"
            value={pnl !== null ? m.signed(pnl) : '—'}
            valueClass={pnl !== null ? tone(pnl) : ''}
            sub={returnPct !== null ? `${m.pct(returnPct)} of deposits` : inr(pnl)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button type="button" size="sm" variant="secondary" magnetic={false} onClick={onUpload} className="!h-9 !px-4 !text-xs">
            <Upload className="h-3.5 w-3.5" /> Upload report
          </Button>
          <button
            type="button"
            data-cursor="hover"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            Details
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', details && 'rotate-180')} />
          </button>
        </div>
      </div>

      {details && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <p className="text-xs text-text-secondary">
            {account.report.time && <>Report generated {stamp(account.report.time)} (broker server time)</>}
            {account.report.from && (
              <>
                {' · '}covers {day(account.report.from)} – {day(account.report.to)} ({account.report.trades} trades)
              </>
            )}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h3 className={cn(labelClass, 'mb-2')}>Broker report summary</h3>
              {summaryRows.length === 0 ? (
                <p className="text-xs text-text-secondary">This report had no summary block.</p>
              ) : (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  {summaryRows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1">
                      <dt className="min-w-0 truncate text-text-secondary">{label}</dt>
                      <dd className="shrink-0 font-mono text-text">{m.hidden && MONEY_LABELS.has(label) ? MASK : value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section>
              <h3 className={cn(labelClass, 'mb-2')}>Deposits &amp; withdrawals</h3>
              {account.balanceOps.length === 0 ? (
                <p className="text-xs text-text-secondary">No deposits or withdrawals in the uploaded reports.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {account.balanceOps.map((o) => (
                    <li key={`${o.time}-${o.amount}-${o.comment}`} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
                      <span className="min-w-0">
                        <span className="font-mono text-text-secondary">{o.time.slice(0, 10)}</span>
                        <span className="ml-2 capitalize text-text">{o.type === 'balance' ? (o.amount < 0 ? 'withdrawal' : 'deposit') : o.type}</span>
                        {o.comment && <span className="ml-2 truncate font-mono text-2xs text-text-secondary/70">{o.comment}</span>}
                      </span>
                      <span className={cn('shrink-0 font-mono font-semibold', tone(o.amount))}>{m.signed(o.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
