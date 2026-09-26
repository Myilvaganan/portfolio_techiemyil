import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { HideNumbersButton } from '@/components/journal/chrome'
import { Card, Kpi } from '@/components/statements/parts'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { todayStr } from '@/lib/journal'
import { BANK_CATEGORIES, monthLabel, type Txn } from '@/lib/statements'
import { budgetStatus, isCardBillPayment, spentByCategory, tagKeyForMerchant, txnTag, type BudgetStatus, type TxnTag } from '@/lib/budget'
import { reviewQueue, suggestMatch } from '@/lib/rules'
import { spendAlerts } from '@/lib/anomalies'
import { addRule, removeRule, setBudget, setTag } from '@/lib/financeApi'
import { useFinanceData } from '@/hooks/useFinanceData'

const NON_BUDGET = new Set(['Salary', 'Other Income', 'Interest', 'Refund', 'Transfer', 'Card Payment', 'Cashback & Rewards'])
const PICK_CATEGORIES = BANK_CATEGORIES.filter((c) => !NON_BUDGET.has(c))
const TAG_OPTIONS: { id: TxnTag | ''; label: string }[] = [
  { id: '', label: 'Normal' },
  { id: 'household', label: 'Household' },
  { id: 'family', label: 'Family' },
  { id: 'ignore', label: 'Ignore' },
]

const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function Ring({ pct, over, near }: { pct: number; over: boolean; near: boolean }) {
  const r = 20
  const c = 2 * Math.PI * r
  const color = over ? 'var(--color-error)' : near ? '#f59e0b' : 'var(--color-positive)'
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0" role="img" aria-label={`${Math.round(pct)}% used`}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-border)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} transform="rotate(-90 26 26)" className="transition-[stroke-dashoffset] duration-500" />
      <text x="26" y="30" textAnchor="middle" className="fill-text font-mono text-2xs font-semibold">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

function CategoryCard({ s, onSave }: { s: BudgetStatus; onSave: (category: string, limit: number) => Promise<void> }) {
  const m = useMoney()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const has = s.limit > 0

  async function save() {
    const n = Number(draft.replace(/[^0-9.]/g, ''))
    setSaving(true)
    try {
      await onSave(s.category, Number.isFinite(n) ? n : 0)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard hover={false} className={cn('p-3.5', s.over && 'border-error/40 bg-gradient-to-br from-error/[0.12] to-transparent', s.near && 'border-amber-500/40')}>
      <div className="flex items-center gap-3">
        {has ? <Ring pct={s.pct} over={s.over} near={s.near} /> : <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-dashed border-border text-2xs text-text-secondary">no limit</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{s.category}</p>
          <p className="font-mono text-base font-semibold leading-tight text-text">{m.inr(s.spent)}</p>
          {has && <p className={cn('text-2xs', s.over ? 'text-error' : 'text-text-secondary')}>{s.over ? `${m.inr(-s.remaining)} over` : `${m.inr(s.remaining)} left`}</p>}
        </div>
      </div>
      {has && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
          <div className={cn('h-full rounded-full', s.over ? 'bg-error' : s.near ? 'bg-amber-500' : 'bg-positive')} style={{ width: `${Math.min(100, s.pct)}%` }} />
        </div>
      )}
      {has && s.daysLeft > 0 && s.projected > 0 && (
        <p className={cn('mt-1.5 text-2xs', s.projectedOver ? 'text-amber-500' : 'text-text-secondary')}>
          On pace for {m.inr(s.projected)} · {s.daysLeft}d left
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-2xs">
        {editing ? (
          <form
            className="flex w-full items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <input autoFocus inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Monthly limit" aria-label={`${s.category} monthly limit`} className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-text outline-none focus:border-accent" />
            <button type="submit" disabled={saving} className="rounded-md bg-accent/15 px-2 py-1 font-semibold text-accent">
              {saving ? '…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-1 text-text-secondary hover:text-text">
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="text-text-secondary">{has ? `Limit ${m.inr(s.limit)}` : 'No budget set'}</span>
            <button
              type="button"
              data-cursor="hover"
              onClick={() => {
                setDraft(has ? String(s.limit) : '')
                setEditing(true)
              }}
              className="font-semibold text-accent hover:underline"
            >
              {has ? 'Edit' : 'Set limit'}
            </button>
          </>
        )}
      </div>
    </GlassCard>
  )
}

function Select({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; label: string; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn('rounded-md border border-border bg-surface-2 px-1.5 py-1 text-2xs text-text outline-none focus:border-accent', className)}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Budgets() {
  const m = useMoney()
  const { loading, error, settingsError, all, bank, settings, patch } = useFinanceData()
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [ruleText, setRuleText] = useState('')
  const [ruleCat, setRuleCat] = useState('Food & Dining')

  const spent = useMemo(() => spentByCategory(all, month, settings.tags), [all, month, settings.tags])
  const rows = useMemo(() => budgetStatus(settings.budgets, spent, month, today), [settings.budgets, spent, month, today])
  const budgeted = rows.filter((r) => r.limit > 0)
  const totalLimit = budgeted.reduce((s, r) => s + r.limit, 0)
  const totalSpent = budgeted.reduce((s, r) => s + r.spent, 0)
  const projected = budgeted.reduce((s, r) => s + r.projected, 0)
  const overCount = budgeted.filter((r) => r.over).length
  const alerts = useMemo(() => spendAlerts(all, today), [all, today])
  const queue = useMemo(() => reviewQueue(all, 6), [all])
  const merchants = useMemo(() => {
    const by = new Map<string, { sample: Txn; total: number }>()
    for (const t of all) {
      if (t.date.slice(0, 7) !== month || !(t.debit > 0) || isCardBillPayment(t)) continue
      const k = t.merchant.trim().toLowerCase()
      if (!k) continue
      const cur = by.get(k)
      by.set(k, { sample: t, total: (cur?.total ?? 0) + t.debit })
    }
    return [...by.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [all, month])
  const latest = bank.at(-1)?.date

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setActionError(null)
    try {
      await fn()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const saveLimit = async (category: string, limit: number) => {
    try {
      patch({ budgets: await setBudget(category, limit) })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not save the limit.')
      throw e
    }
  }
  const fileAs = (match: string, category: string) =>
    run(`rule-${match}`, async () => {
      patch({ rules: await addRule(match, category) })
    })
  const tagMerchant = (t: Txn, tag: string) =>
    run(`tag-${t.merchant}`, async () => {
      patch({ tags: await setTag(tagKeyForMerchant(t), (tag || null) as TxnTag | null) })
    })

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">Money</p>
          <h1 className="mt-1 page-title">Budgets</h1>
          <p className="page-lede">
            Monthly limits per category from your bank and card spending{latest && <> · statements up to {latest}</>}. Transfers, card bill payments, family and ignored items are left out.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-border bg-surface-2 p-0.5 text-xs">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-1.5 text-text-secondary hover:text-text">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7.5rem] text-center font-semibold text-text">{monthLabel(month, true)}</span>
            <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-1.5 text-text-secondary hover:text-text disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <HideNumbersButton />
        </div>
      </div>

      {(error || actionError || settingsError) && (
        <GlassCard hover={false} className="p-3 text-sm text-error" role="alert">
          {error || actionError || settingsError}
        </GlassCard>
      )}

      {loading ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your statements…
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Budgeted" value={totalLimit} format={m.inr} sub={`${budgeted.length} categories`} />
            <Kpi label="Spent" value={totalSpent} format={m.inr} sub={totalLimit ? `${Math.round((totalSpent / totalLimit) * 100)}% of budget` : 'Set a limit to start'} tone={totalLimit && totalSpent > totalLimit ? 'bad' : undefined} />
            <Kpi label="Left" value={totalLimit - totalSpent} format={m.inr} tone={totalLimit ? (totalSpent > totalLimit ? 'bad' : 'good') : undefined} />
            <Kpi label="On pace for" value={projected} format={m.inr} sub={overCount ? `${overCount} over budget` : 'By month end'} tone={totalLimit && projected > totalLimit ? 'warn' : undefined} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid content-start grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {rows.length === 0 && <p className="text-sm text-text-secondary">No spending this month yet.</p>}
              {rows.map((s) => (
                <CategoryCard key={s.category} s={s} onSave={saveLimit} />
              ))}
              <GlassCard hover={false} className="p-3.5">
                <p className="text-sm font-semibold text-text">Add a budget</p>
                <Select label="Category" value="" onChange={(c) => c && void saveLimit(c, 1000).catch(() => {})} className="mt-2 w-full" options={[{ id: '', label: 'Pick a category…' }, ...PICK_CATEGORIES.filter((c) => !settings.budgets[c]).map((c) => ({ id: c, label: c }))]} />
                <p className="mt-1.5 text-2xs text-text-secondary">Starts at ₹1,000; use Edit to change it.</p>
              </GlassCard>
            </div>

            <div className="space-y-3">
              <Card title="Spend alerts" aside={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
                {alerts.length === 0 ? (
                  <p className="text-sm text-text-secondary">Nothing unusual in the last few weeks.</p>
                ) : (
                  <ul className="space-y-2">
                    {alerts.slice(0, 5).map((a) => (
                      <li key={a.id} className="text-sm">
                        <p className="font-medium text-text">{a.title}</p>
                        <p className="text-2xs text-text-secondary">{m.hidden ? a.detail.replace(/₹[\d,.]+/g, m.inr(0)) : a.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Needs a category">
                {queue.length === 0 ? (
                  <p className="text-sm text-text-secondary">Everything is filed.</p>
                ) : (
                  <ul className="space-y-2">
                    {queue.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-text">{t.merchant || t.description}</p>
                          <p className="font-mono text-2xs text-text-secondary">
                            {t.date} · {m.inr(t.debit)}
                          </p>
                        </div>
                        <Select label={`File ${t.merchant} as`} value="" onChange={(c) => c && void fileAs(suggestMatch(t), c)} className="w-28 shrink-0" options={[{ id: '', label: busy === `rule-${suggestMatch(t)}` ? 'Saving…' : 'File as…' }, ...PICK_CATEGORIES.filter((c) => c !== 'Other').map((c) => ({ id: c, label: c }))]} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Family and ignored" aside={<span className="text-2xs text-text-secondary">top merchants this month</span>}>
                <ul className="space-y-1.5">
                  {merchants.map(({ sample, total }) => (
                    <li key={sample.merchant} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text">{sample.merchant}</p>
                        <p className="font-mono text-2xs text-text-secondary">{m.inr(total)}</p>
                      </div>
                      <Select label={`Tag ${sample.merchant}`} value={settings.tags[tagKeyForMerchant(sample)] ?? txnTag(sample, settings.tags) ?? ''} onChange={(v) => void tagMerchant(sample, v)} className="w-24 shrink-0" options={TAG_OPTIONS} />
                    </li>
                  ))}
                  {merchants.length === 0 && <li className="text-sm text-text-secondary">No spending this month.</li>}
                </ul>
                <p className="mt-2 text-2xs text-text-secondary">Family and Ignore keep a merchant out of spending; Household counts it even if it is a transfer.</p>
              </Card>

              <Card title="Category rules">
                <form
                  className="flex flex-wrap items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (ruleText.trim().length < 2) return
                    void fileAs(ruleText.trim(), ruleCat).then(() => setRuleText(''))
                  }}
                >
                  <span className="text-2xs text-text-secondary">Always file</span>
                  <input value={ruleText} onChange={(e) => setRuleText(e.target.value)} placeholder="text or /regex/" aria-label="Text to match" className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text outline-none focus:border-accent" />
                  <span className="text-2xs text-text-secondary">as</span>
                  <Select label="Category" value={ruleCat} onChange={setRuleCat} options={PICK_CATEGORIES.map((c) => ({ id: c, label: c }))} />
                  <button type="submit" className="rounded-md bg-accent/15 px-2 py-1 text-2xs font-semibold text-accent">
                    Add
                  </button>
                </form>
                <ul className="mt-3 space-y-1">
                  {settings.rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-text">
                        {r.match} <span className="text-text-secondary">→</span> {r.category}
                      </span>
                      <button type="button" aria-label={`Remove rule ${r.match}`} onClick={() => void run(`rm-${r.id}`, async () => patch({ rules: await removeRule(r.id) }))} className="text-text-secondary hover:text-error">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                  {settings.rules.length === 0 && <li className="text-2xs text-text-secondary">No rules yet.</li>}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
