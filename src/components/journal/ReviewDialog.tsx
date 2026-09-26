import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { monthLabel, netInr, type JournalSettings, type Trade } from '@/lib/journal'
import { analyze, buildInsights } from '@/lib/journalAnalytics'
import { fetchJournal } from '@/lib/journalStore'
import { useMoney } from '@/lib/privacy'
import { Chip } from './parts'

type Scope = 'month' | 'year'

function rangeOf(scope: Scope, viewedMonth: string): { from: string; to: string; label: string } {
  const year = viewedMonth.slice(0, 4)
  if (scope === 'year') return { from: `${year}-01`, to: `${year}-12`, label: `${year} — yearly review` }
  return { from: viewedMonth, to: viewedMonth, label: `${monthLabel(viewedMonth)} — monthly review` }
}

function Body({ settings, viewedMonth, account, usdInr }: { settings: JournalSettings; viewedMonth: string; account: string; usdInr: number }) {
  const m = useMoney()
  const [scope, setScope] = useState<Scope>('month')
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const { from, to, label } = rangeOf(scope, viewedMonth)

  useEffect(() => {
    let cancelled = false
    setTrades(null)
    fetchJournal(from, to, account)
      .then((data) => !cancelled && setTrades(account === '*' ? data.trades.map((t) => (t.account ? { ...t, fxRate: usdInr } : t)) : data.trades))
      .catch(() => !cancelled && setTrades([]))
    return () => {
      cancelled = true
    }
  }, [from, to, account, usdInr])

  const a = useMemo(() => analyze(trades ?? [], settings), [trades, settings])
  const money = (n: number) => `${n < 0 ? '-' : ''}${m.inr(Math.abs(n))}`
  const insights = useMemo(() => buildInsights(a, settings, money), [a, settings, m]) // eslint-disable-line react-hooks/exhaustive-deps

  const ranked = useMemo(() => [...(trades ?? [])].sort((x, y) => netInr(y) - netInr(x)), [trades])
  const best5 = ranked.slice(0, 5).filter((t) => netInr(t) > 0)
  const worst5 = ranked
    .slice(-5)
    .reverse()
    .filter((t) => netInr(t) < 0)

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .journal-review-print, .journal-review-print * { visibility: visible; }
          .journal-review-print { position: fixed; inset: 0; overflow: visible; padding: 24px; }
        }
      `}</style>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div role="tablist" aria-label="Review period" className="flex gap-1.5">
          <Chip active={scope === 'month'} onClick={() => setScope('month')}>
            This month
          </Chip>
          <Chip active={scope === 'year'} onClick={() => setScope('year')}>
            This year
          </Chip>
        </div>
        <Button size="sm" magnetic={false} disabled={!trades} onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
        </Button>
      </div>

      {trades === null ? (
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the review…
        </p>
      ) : (
        <div className="journal-review-print space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">{label}</h2>
            <p className="text-xs text-text-secondary">{a.totals.trades} trades</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Net before tax', value: money(a.totals.net) },
              { label: 'Tax', value: a.totals.tax > 0 ? `-${m.inr(a.totals.tax)}` : m.inr(0) },
              { label: 'Net after tax', value: money(a.totals.afterTax) },
              { label: 'Win rate', value: a.totals.trades ? `${a.winRate.toFixed(1)}%` : '—' },
              { label: 'Profit factor', value: a.profitFactor === null ? '—' : a.profitFactor.toFixed(2) },
              { label: 'Max drawdown', value: a.maxDrawdown.amount > 0 ? `-${m.inr(a.maxDrawdown.amount)}` : m.inr(0) },
              { label: 'Best day', value: a.bestDay ? money(a.bestDay.net) : '—' },
              { label: 'Worst day', value: a.worstDay ? money(a.worstDay.net) : '—' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-text-secondary">{k.label}</p>
                <p className="mt-0.5 truncate font-mono text-sm font-semibold text-text">{k.value}</p>
              </div>
            ))}
          </div>

          {insights.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">Coach insights</h3>
              <ul className="space-y-1">
                {insights.map((i) => (
                  <li key={i.text} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text">
                    {i.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">Best trades</h3>
              {best5.length === 0 ? (
                <p className="text-xs text-text-secondary">No winning trades.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {best5.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1">
                      <span className="truncate">
                        {t.date} · {t.instrument}
                      </span>
                      <span className="font-mono font-semibold text-positive">{money(netInr(t))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">Worst trades</h3>
              {worst5.length === 0 ? (
                <p className="text-xs text-text-secondary">No losing trades.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {worst5.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1">
                      <span className="truncate">
                        {t.date} · {t.instrument}
                      </span>
                      <span className="font-mono font-semibold text-error">{money(netInr(t))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">By instrument</h3>
            {a.byInstrument.length === 0 ? (
              <p className="text-xs text-text-secondary">No trades.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="py-1 font-medium">Instrument</th>
                    <th className="py-1 text-right font-medium">Trades</th>
                    <th className="py-1 text-right font-medium">Win %</th>
                    <th className="py-1 text-right font-medium">Net P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {a.byInstrument.map((s) => (
                    <tr key={s.label} className="border-b border-border/60">
                      <td className="py-1">{s.label}</td>
                      <td className="py-1 text-right">{s.trades}</td>
                      <td className="py-1 text-right">{s.winRate.toFixed(0)}%</td>
                      <td className={cn('py-1 text-right font-mono font-semibold', s.net >= 0 ? 'text-positive' : 'text-error')}>{money(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function ReviewDialog({
  open,
  onOpenChange,
  settings,
  viewedMonth,
  account = '',
  usdInr = 1,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: JournalSettings
  viewedMonth: string
  account?: string
  usdInr?: number
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm print:hidden" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] max-h-[92vh] w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl print:relative print:inset-auto print:left-0 print:top-0 print:z-auto print:max-h-none print:w-auto print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:bg-transparent print:p-0 print:shadow-none"
        >
          <div className="mb-3 flex items-center justify-between print:hidden">
            <Dialog.Title className="font-display text-lg font-semibold text-text">Review</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {open && <Body settings={settings} viewedMonth={viewedMonth} account={account} usdInr={usdInr} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
