import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PiggyBank, X } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { CategoryPicker } from '@/components/statements/CategoryPicker'
import { PageBadge } from '@/components/admin/AdminShell'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { HideNumbersButton } from '@/components/journal/chrome'
import { Card, Kpi } from '@/components/statements/parts'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { todayStr } from '@/lib/journal'
import { BANK_CATEGORIES, monthLabel, type Txn } from '@/lib/statements'
import { PLAN_LABELS, PLAN_PREFIX, budgetStatus, countsAsSpend, isCardBillPayment, monthIncome, planBucket, planTargets, planTotals, spentByCategory, tradingFlow, tagKeyForMerchant, txnTag, type BudgetStatus, type TxnTag } from '@/lib/budget'
import { reviewQueue, suggestMatch } from '@/lib/rules'
import { spendAlerts } from '@/lib/anomalies'
import { addRule, removeRule, setBudget, setTag } from '@/lib/financeApi'
import { useFinanceData } from '@/hooks/useFinanceData'

const NON_BUDGET = new Set(['Salary', 'Other Income', 'Interest', 'Refund', 'Transfer', 'Card Payment', 'Cashback & Rewards'])
const PICK_CATEGORIES = BANK_CATEGORIES.filter((c) => !NON_BUDGET.has(c))
const TAG_OPTIONS: { id: TxnTag | ''; label: string; hint: string }[] = [
  { id: '', label: 'Auto', hint: 'Follows the transaction category' },
  { id: 'needs', label: 'Needs', hint: 'Rent, EMI, groceries, bills, insurance' },
  { id: 'wants', label: 'Wants', hint: 'Dining, shopping, travel, entertainment' },
  { id: 'savings', label: 'Savings & investing', hint: 'Investments and gold savings' },
  { id: 'trading', label: 'Trading', hint: 'Zerodha and Octa: tracked apart from living costs' },
  { id: 'family', label: 'Family support', hint: 'Money to family, kept out of the budget' },
  { id: 'ignore', label: 'Not counted', hint: 'Transfers between own accounts, card bills' },
]

const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const REPORT_COLORS = ['#14b8a6', '#f59e0b', '#6366f1', '#ec4899', '#22c55e', '#0ea5e9']
const formatCompact = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')}L` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const LOCKED_CATEGORIES = new Set(['Card Payment'])

function Ring({ pct, over, near }: { pct: number; over: boolean; near: boolean }) {
  const r = 20
  const c = 2 * Math.PI * r
  const color = over ? 'var(--color-error)' : near ? '#f59e0b' : 'var(--color-positive)'
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0" role="img" aria-label={`${Math.round(pct)}% used`}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-border)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} transform="rotate(-90 26 26)" className="transition-[stroke-dashoffset] duration-500" />
      <text x="26" y="30" textAnchor="middle" fontSize={pct >= 1000 ? 9 : pct >= 100 ? 10 : 12} className="fill-text font-semibold">
        {pct >= 1000 ? '999+' : `${Math.round(pct)}%`}
      </text>
    </svg>
  )
}

function CategoryCard({ s, onSave, onOpen }: { s: BudgetStatus; onSave: (category: string, limit: number) => Promise<void>; onOpen: (category: string) => void }) {
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
      <div role="button" tabIndex={0} aria-label={`Show ${s.category} transactions`} data-cursor="hover" onClick={() => onOpen(s.category)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(s.category)} className="flex cursor-pointer items-center gap-3">
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
  const month = today.slice(0, 7)
  const prevMonth = prevMonthOf(month)
  const [sort, setSort] = useState<{ key: 'date' | 'merchant' | 'amount' | 'category' | 'tag'; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [page, setPage] = useState(0)
  const [editPlan, setEditPlan] = useState(false)
  const [planDraft, setPlanDraft] = useState({ needs: '', wants: '', savings: '' })
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [txnFilter, setTxnFilter] = useState<'todo' | 'all'>('todo')
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
  const prevRows = useMemo(() => budgetStatus(settings.budgets, spentByCategory(all, prevMonth, settings.tags), prevMonth, today), [all, prevMonth, settings.budgets, settings.tags, today])
  const prevBudgeted = prevRows.filter((r) => r.limit > 0)
  const prevLimit = prevBudgeted.reduce((s, r) => s + r.limit, 0)
  const prevSpentAll = prevRows.reduce((s, r) => s + r.spent, 0)
  const prevOver = prevBudgeted.filter((r) => r.over)
  const prevTop = [...prevRows].sort((a, b) => b.spent - a.spent).filter((r) => r.spent > 0).slice(0, 5)
  const monthTxns = useMemo(
    () => all.filter((t) => t.date.slice(0, 7) === month && t.debit > 0 && !isCardBillPayment(t)).sort((a, b) => (a.category === 'Other' ? 0 : 1) - (b.category === 'Other' ? 0 : 1) || b.date.localeCompare(a.date) || b.debit - a.debit),
    [all, month],
  )
  const catTxns = useMemo(() => (openCat ? monthTxns.filter((t) => t.category === openCat).sort((a, b) => b.date.localeCompare(a.date) || b.debit - a.debit) : []), [monthTxns, openCat])
  const trading = useMemo(() => tradingFlow(all, month, settings.tags), [all, month, settings.tags])
  const targets = planTargets(settings.budgets)
  const totals = useMemo(() => planTotals(all, month, settings.tags), [all, month, settings.tags])
  const incomeNow = useMemo(() => monthIncome(all, month), [all, month])
  const incomePrev = useMemo(() => monthIncome(all, prevMonth), [all, prevMonth])
  const income = incomeNow || incomePrev
  const suggestions = useMemo(() => {
    const seen = new Map<string, number>()
    for (const t of all) {
      const k = t.merchant.trim()
      if (k.length >= 2) seen.set(k, (seen.get(k) ?? 0) + (t.date.slice(0, 7) === month ? 1000 : 1))
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k]) => k)
  }, [all, month])
  async function savePlan() {
    await run('plan', async () => {
      let next = settings.budgets
      for (const k of ['needs', 'wants', 'savings'] as const) {
        const n = Math.max(0, Math.min(100, Number(planDraft[k].replace(/[^0-9.]/g, '')) || 0))
        next = await setBudget(`${PLAN_PREFIX}${k}`, n)
      }
      patch({ budgets: next })
      setEditPlan(false)
    })
  }
  const todoCount = monthTxns.filter((t) => t.category === 'Other').length
  const sortedTxns = useMemo(() => {
    const base = txnFilter === 'todo' ? monthTxns.filter((t) => t.category === 'Other') : monthTxns
    const val = (t: Txn) => (sort.key === 'date' ? t.date : sort.key === 'merchant' ? (t.merchant || t.description).toLowerCase() : sort.key === 'amount' ? t.debit : sort.key === 'category' ? t.category : txnTag(t, settings.tags) ?? '')
    return [...base].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.date.localeCompare(a.date)
    })
  }, [monthTxns, txnFilter, sort, settings.tags])
  const PAGE = 24
  const pages = Math.max(1, Math.ceil(sortedTxns.length / PAGE))
  const curPage = Math.min(page, pages - 1)
  const shownTxns = sortedTxns.slice(curPage * PAGE, curPage * PAGE + PAGE)
  const sortBy = (key: typeof sort.key) => {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'amount' || key === 'date' ? -1 : 1 }))
    setPage(0)
  }
  const alerts = useMemo(() => spendAlerts(all, today), [all, today])
  const queue = useMemo(() => reviewQueue(all.filter((t) => t.date.slice(0, 7) === month), 6), [all, month])
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
        <div className="flex items-start gap-3.5">
          <PageBadge />
          <div className="min-w-0">
          <p className="page-eyebrow">Money</p>
          <h1 className="mt-1 page-title">Budgets</h1>
          <p className="page-lede">
            This month's limits per category from your bank and card spending{latest && <> · statements up to {latest}</>}. Transfers, card bill payments, family and ignored items are left out.
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text">{monthLabel(month, true)}</span>
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
          <GlassCard hover={false} className="relative overflow-hidden bg-gradient-to-br from-accent/[0.14] via-transparent to-transparent p-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
            <div className="relative flex items-center justify-between gap-2">
              <div>
                <p className="label-caps">Last month</p>
                <h2 className="text-xl font-bold text-text">{monthLabel(prevMonth, true)} report</h2>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', prevOver.length ? 'bg-error/15 text-error' : prevLimit ? 'bg-positive/15 text-positive' : 'bg-surface-3 text-text-secondary')}>
                {prevOver.length ? `${prevOver.length} over budget` : prevLimit ? 'Within budget' : 'No budgets set'}
              </span>
            </div>
            {prevSpentAll === 0 ? (
              <p className="relative mt-4 text-sm text-text-secondary">No spending recorded last month.</p>
            ) : (
              <div className="relative mt-4 grid items-center gap-6 lg:grid-cols-[13rem_1fr_16rem]">
                <div className="mx-auto">
                  <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Last month spending by category">
                    {(() => {
                      const r = 74
                      const c = 2 * Math.PI * r
                      let off = 0
                      const restLen = c - prevTop.reduce((t, x) => t + (x.spent / prevSpentAll) * c, 0)
                      const slices = prevTop.map((x, i) => {
                        const len = (x.spent / prevSpentAll) * c
                        const el = <circle key={x.category} cx="100" cy="100" r={r} fill="none" stroke={REPORT_COLORS[i % REPORT_COLORS.length]} strokeWidth="26" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />
                        off += len
                        return el
                      })
                      return [...slices, restLen > 2 && <circle key="rest" cx="100" cy="100" r={r} fill="none" stroke="var(--color-border)" strokeWidth="26" strokeDasharray={`${restLen - 2} ${c}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />]
                    })()}
                    <text x="100" y="92" textAnchor="middle" className="fill-text-secondary" fontSize="11">Spent</text>
                    <text x="100" y="116" textAnchor="middle" className="fill-text font-bold" fontSize="22">{m.hidden ? '₹•••' : formatCompact(prevSpentAll)}</text>
                  </svg>
                </div>
                <ul className="space-y-3">
                  {prevTop.map((x, i) => (
                    <li key={x.category}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-text">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: REPORT_COLORS[i % REPORT_COLORS.length] }} />
                          <span className="truncate">{x.category}</span>
                        </span>
                        <span className={cn('shrink-0 font-mono text-xs', x.over ? 'font-semibold text-error' : 'text-text-secondary')}>
                          {m.inr(x.spent)}
                          {x.limit > 0 && <> / {m.inr(x.limit)}</>}
                        </span>
                      </div>
                      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-border/60">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (x.spent / Math.max(x.limit, x.spent)) * 100)}%`, background: x.over ? 'var(--color-error)' : REPORT_COLORS[i % REPORT_COLORS.length] }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-1">
                  {[
                    ['Total spent', m.inr(prevSpentAll), ''],
                    ['Budgeted', prevLimit ? m.inr(prevLimit) : '–', ''],
                    [prevLimit && prevSpentAll > prevLimit ? 'Over by' : 'Under by', prevLimit ? m.inr(Math.abs(prevLimit - prevSpentAll)) : '–', prevLimit && prevSpentAll > prevLimit ? 'text-error' : 'text-positive'],
                    ['Biggest', prevTop[0] ? `${prevTop[0].category} · ${Math.round((prevTop[0].spent / prevSpentAll) * 100)}%` : '–', ''],
                  ].map(([k, v, tone]) => (
                    <div key={k} className="rounded-2xl border border-border/60 bg-surface-2/60 px-3 py-2">
                      <p className="text-2xs text-text-secondary">{k}</p>
                      <p className={cn('truncate font-mono text-sm font-semibold text-text', tone)}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          <Card
            title="Your plan"
            aside={
              editPlan ? (
                <span className="flex items-center gap-2 text-2xs">
                  <button type="button" onClick={() => void savePlan()} disabled={busy === 'plan'} className="font-semibold text-accent">Save</button>
                  <button type="button" onClick={() => setEditPlan(false)} className="text-text-secondary">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => { setPlanDraft({ needs: String(targets.needs), wants: String(targets.wants), savings: String(targets.savings) }); setEditPlan(true) }} className="text-2xs font-semibold text-accent">Edit targets</button>
              )
            }
          >
            {income === 0 ? (
              <p className="text-sm text-text-secondary">No salary found in your statements yet, so there is nothing to plan against.</p>
            ) : (
              <>
                <p className="mb-3 text-2xs text-text-secondary">
                  Planned against {m.inr(income)} income ({incomeNow ? 'this month' : `${monthLabel(prevMonth, true)}, until this month's salary arrives`}).
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {(['needs', 'wants', 'savings'] as const).map((k) => {
                    const target = (income * targets[k]) / 100
                    const pct = target > 0 ? (totals[k] / target) * 100 : 0
                    const over = k === 'savings' ? false : totals[k] > target
                    return (
                      <div key={k}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-text">{PLAN_LABELS[k]}</p>
                          {editPlan ? (
                            <label className="flex items-center gap-1 text-2xs text-text-secondary">
                              <input inputMode="numeric" value={planDraft[k]} onChange={(e) => setPlanDraft({ ...planDraft, [k]: e.target.value })} aria-label={`${PLAN_LABELS[k]} target percent`} className="w-12 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-right font-mono text-xs text-text outline-none focus:border-accent" />%
                            </label>
                          ) : (
                            <span className="text-2xs text-text-secondary">target {targets[k]}%</span>
                          )}
                        </div>
                        <p className="font-mono text-base font-semibold text-text">{m.inr(totals[k])}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                          <div className={cn('h-full rounded-full', over ? 'bg-error' : 'bg-positive')} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <p className={cn('mt-1 text-2xs', over ? 'text-error' : 'text-text-secondary')}>
                          {k === 'savings' ? (totals[k] >= target ? `${m.inr(totals[k] - target)} above target` : `${m.inr(target - totals[k])} to reach target`) : over ? `${m.inr(totals[k] - target)} over ${m.inr(target)}` : `${m.inr(target - totals[k])} left of ${m.inr(target)}`}
                        </p>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-3 text-2xs text-text-secondary">
                  Also this month: Trading funded {m.inr(trading.net)} · Family support {m.inr(totals.family)} (both kept apart from the plan).
                </p>
              </>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Budgeted" value={totalLimit} format={m.inr} sub={`${budgeted.length} categories`} />
            <Kpi label="Spent" value={totalSpent} format={m.inr} sub={totalLimit ? `${Math.round((totalSpent / totalLimit) * 100)}% of budget` : 'Set a limit to start'} tone={totalLimit && totalSpent > totalLimit ? 'bad' : undefined} />
            <Kpi label="Left" value={totalLimit - totalSpent} format={m.inr} tone={totalLimit ? (totalSpent > totalLimit ? 'bad' : 'good') : undefined} />
            <Kpi label="On pace for" value={projected} format={m.inr} sub={overCount ? `${overCount} over budget` : 'By month end'} tone={totalLimit && projected > totalLimit ? 'warn' : undefined} />
          </div>

          <div className="space-y-5">
            <div>
              <h2 className="mb-3 label-caps">Budgets by category</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {rows.length === 0 && <EmptyState icon={PiggyBank} title="No spending this month yet" hint="Upload a bank or card statement to see budgets by category." className="sm:col-span-2 lg:col-span-3 2xl:col-span-4" />}
              {rows.map((s) => (
                <CategoryCard key={s.category} s={s} onSave={saveLimit} onOpen={setOpenCat} />
              ))}
              {(trading.sent > 0 || trading.back > 0) && (
                <GlassCard hover={false} className="p-3.5">
                  <p className="text-sm font-semibold text-text">Trading</p>
                  <p className="font-mono text-base font-semibold leading-tight text-text">{m.inr(trading.net)}</p>
                  <p className="text-2xs text-text-secondary">{trading.net >= 0 ? 'net funded to brokers' : 'net withdrawn from brokers'}</p>
                  <div className="mt-2.5 space-y-1 text-2xs">
                    <p className="flex justify-between text-text-secondary"><span>Sent to Zerodha / Octa</span><span className="font-mono text-text">{m.inr(trading.sent)}</span></p>
                    <p className="flex justify-between text-text-secondary"><span>Received back</span><span className="font-mono text-text">{m.inr(trading.back)}</span></p>
                  </div>
                  <p className="mt-2 text-2xs text-text-secondary">Not counted as spending.</p>
                </GlassCard>
              )}
              <GlassCard hover={false} className="p-3.5">
                <p className="text-sm font-semibold text-text">Add a budget</p>
                <Select label="Category" value="" onChange={(c) => c && void saveLimit(c, 1000).catch(() => {})} className="mt-2 w-full" options={[{ id: '', label: 'Pick a category…' }, ...PICK_CATEGORIES.filter((c) => !settings.budgets[c]).map((c) => ({ id: c, label: c }))]} />
                <p className="mt-1.5 text-2xs text-text-secondary">Starts at ₹1,000; use Edit to change it.</p>
              </GlassCard>
              </div>
            </div>

            <div>
              <h2 className="mb-3 label-caps">This month's transactions</h2>
              <Card
                title="Categorise your spending"
                aside={
                  <div role="radiogroup" aria-label="Show transactions" className="inline-flex rounded-full bg-surface-3 p-0.5 text-2xs font-semibold">
                    {([['todo', `Needs category (${todoCount})`], ['all', `All (${monthTxns.length})`]] as const).map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={txnFilter === id} onClick={() => { setTxnFilter(id); setPage(0) }} className={cn('rounded-full px-2.5 py-1', txnFilter === id ? 'bg-accent text-black' : 'text-text-secondary hover:text-text')}>
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                <p className="mb-3 text-2xs text-text-secondary">Already-categorised items are left as they are; change any you like. Picking a category files every transaction from the same merchant.</p>
                <div className="grid gap-x-8 xl:grid-cols-2">
                  {[0, 1].map((i) => (
                    <div key={i} className={cn("hidden grid-cols-[5.5rem_minmax(0,1fr)_6rem_9rem_7.5rem] gap-2 border-b border-border pb-1.5 text-2xs font-semibold text-text-secondary md:grid", i === 1 && "md:hidden xl:grid")}>
                                      {([['date', 'Date'], ['merchant', 'Merchant'], ['amount', 'Amount'], ['category', 'Category'], ['tag', 'Counts as']] as const).map(([k, label]) => (
                                        <button key={k} type="button" onClick={() => sortBy(k)} className={cn('flex items-center gap-1 text-left hover:text-text', k === 'amount' && 'justify-end', sort.key === k && 'text-text')}>
                                          {label}
                                          {sort.key === k && <span aria-hidden>{sort.dir === 1 ? '▲' : '▼'}</span>}
                                        </button>
                                      ))}
                                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pb-2 pt-2 text-2xs text-text-secondary md:hidden">
                  Sort by
                  <Select label="Sort transactions" value={sort.key} onChange={(v) => sortBy(v as typeof sort.key)} options={[{ id: 'date', label: 'Date' }, { id: 'merchant', label: 'Merchant' }, { id: 'amount', label: 'Amount' }, { id: 'category', label: 'Category' }, { id: 'tag', label: 'Counts as' }]} />
                  <button type="button" onClick={() => setSort((x) => ({ ...x, dir: (x.dir * -1) as 1 | -1 }))} className="rounded-md border border-border px-1.5 py-1">{sort.dir === 1 ? '▲' : '▼'}</button>
                </div>
                <ul className="grid gap-x-8 xl:grid-cols-2">
                  {shownTxns.map((t) => {
                    const tag = txnTag(t, settings.tags) === 'household' ? '' : (txnTag(t, settings.tags) ?? '')
                    return (
                      <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-border/60 py-1.5 md:grid-cols-[5.5rem_minmax(0,1fr)_6rem_9rem_7.5rem]">
                        <span className="hidden font-mono text-2xs text-text-secondary md:block">{t.date.slice(5)}</span>
                        <p className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-xs font-medium text-text" title={t.description}>
                          {t.merchant || t.description}
                          <span className="ml-1.5 font-mono text-2xs font-normal text-text-secondary md:hidden">{t.date.slice(5)}</span>
                        </p>
                        <span className="text-right font-mono text-xs text-text">{m.inr(t.debit)}</span>
                        {LOCKED_CATEGORIES.has(t.category) ? (
                          <span className="text-2xs text-text-secondary">{t.category}</span>
                        ) : (
                          <CategoryPicker value={t.category} categories={PICK_CATEGORIES} title={t.merchant || t.description} busy={busy === `rule-${suggestMatch(t)}`} onPick={(c) => void fileAs(suggestMatch(t), c)} />
                        )}
                        <Select label={`How ${t.merchant} counts`} value={tag} onChange={(v) => void tagMerchant(t, v)} options={TAG_OPTIONS.map((o) => ({ id: o.id, label: o.label }))} className="w-full" />
                        <p className="col-span-full whitespace-normal [overflow-wrap:anywhere] text-[10px] leading-snug text-text-secondary/80" title={t.description}>
                          {[t.description, t.channel, t.type, t.accountKey, t.balance != null ? `Bal ${m.inr(t.balance)}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      </li>
                    )
                  })}
                  {shownTxns.length === 0 && <li className="col-span-full py-4 text-center text-sm text-text-secondary">{txnFilter === 'todo' ? 'Everything this month is categorised.' : 'No transactions this month yet.'}</li>}
                </ul>
                {pages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-2xs text-text-secondary">
                    <span>
                      {curPage * PAGE + 1}–{Math.min(sortedTxns.length, curPage * PAGE + PAGE)} of {sortedTxns.length}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" disabled={curPage === 0} onClick={() => setPage(curPage - 1)} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Previous</button>
                      <span>{curPage + 1} / {pages}</span>
                      <button type="button" disabled={curPage >= pages - 1} onClick={() => setPage(curPage + 1)} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div>
              <h2 className="mb-3 label-caps">Review and rules</h2>
              <div className="gap-4 lg:columns-2 2xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
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
                  <EmptyState icon={PiggyBank} title="Everything is filed" className="py-4" />
                ) : (
                  <ul className="space-y-3">
                    {queue.map((t) => (
                      <li key={t.id} className="flex items-center gap-3">
                        <Avatar name={t.merchant || t.description} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{t.merchant || t.description}</p>
                          <p className="text-2xs text-text-secondary">
                            {t.date} · {m.inr(t.debit)}
                          </p>
                        </div>
                        <CategoryPicker value={t.category} categories={PICK_CATEGORIES} title={t.merchant || t.description} busy={busy === `rule-${suggestMatch(t)}`} onPick={(c) => void fileAs(suggestMatch(t), c)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Sort your spending" aside={<span className="text-2xs text-text-secondary">top merchants this month</span>}>
                <ul className="space-y-4">
                  {merchants.map(({ sample, total }) => {
                    const tag = settings.tags[tagKeyForMerchant(sample)] ?? txnTag(sample, settings.tags) ?? ''
                    return (
                      <li key={sample.merchant} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Avatar name={sample.merchant} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text">{sample.merchant}</p>
                            <p className="text-2xs text-text-secondary">{m.inr(total)}</p>
                          </div>
                          <CategoryPicker value={sample.category} categories={PICK_CATEGORIES} title={sample.merchant} busy={busy === `rule-${suggestMatch(sample)}`} onPick={(c) => void fileAs(suggestMatch(sample), c)} />
                        </div>
                        <Select label={`How ${sample.merchant} counts`} value={tag === 'household' ? '' : tag} onChange={(v) => void tagMerchant(sample, v)} options={TAG_OPTIONS.map((o) => ({ id: o.id, label: o.label }))} className="w-full" />
                      </li>
                    )
                  })}
                  {merchants.length === 0 && <li className="text-sm text-text-secondary">No spending this month.</li>}
                </ul>
                <p className="mt-3 text-2xs leading-relaxed text-text-secondary">Auto follows the category. Pick Needs, Wants, Savings or Trading to place it yourself; Family support and Not counted keep it out of the budget.</p>
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
                  <input list="rule-suggestions" value={ruleText} onChange={(e) => setRuleText(e.target.value)} placeholder="Type or pick a merchant…" aria-label="Text to match" className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text outline-none focus:border-accent" />
                  <datalist id="rule-suggestions">{suggestions.map((x) => <option key={x} value={x} />)}</datalist>
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
          </div>
        </>
      )}
      <Dialog.Root open={openCat !== null} onOpenChange={(o) => !o && setOpenCat(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-[80] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[36rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="section-title">{openCat}</Dialog.Title>
                <Dialog.Description className="text-sm text-text-secondary">
                  {catTxns.length} transactions · {m.inr(catTxns.reduce((s, t) => s + t.debit, 0))} in {monthLabel(month, true)}. Change a category to move it.
                </Dialog.Description>
              </div>
              <Dialog.Close aria-label="Close" className="rounded-full p-2 text-text-secondary hover:bg-surface-3 hover:text-text">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <ul className="divide-y divide-border">
              {catTxns.map((t) => {
                const details: [string, string][] = [
                  ['Date', t.date],
                  ['Account', t.accountKey],
                  ['Channel', t.channel ?? ''],
                  ['Type', t.type ?? ''],
                  ['Balance after', t.balance != null ? m.inr(t.balance) : ''],
                  ['Credit', t.credit > 0 ? m.inr(t.credit) : ''],
                ].filter(([, v]) => v) as [string, string][]
                return (
                  <li key={t.id} className="space-y-2 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={t.merchant || t.description} size="md" />
                      <p className="min-w-0 flex-1 break-words text-sm font-medium text-text">{t.merchant || t.description}</p>
                      <span className="shrink-0 font-mono text-sm font-semibold text-text">{m.inr(t.debit)}</span>
                    </div>
                    <p className="break-words rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-2xs leading-relaxed text-text-secondary">{t.description}</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-2xs sm:grid-cols-3">
                      {details.map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-text-secondary">{k}</dt>
                          <dd className="truncate font-medium text-text">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {!countsAsSpend(t, settings.tags) && <p className="text-2xs font-semibold text-amber-500">Not counted in your budget: {PLAN_LABELS[planBucket(t, settings.tags)]}. Change it below to count it.</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Select label={`How ${t.merchant} counts`} value={txnTag(t, settings.tags) === 'household' ? '' : (txnTag(t, settings.tags) ?? '')} onChange={(v) => void tagMerchant(t, v)} options={TAG_OPTIONS.map((o) => ({ id: o.id, label: o.label }))} />
                      {LOCKED_CATEGORIES.has(t.category) ? (
                        <span className="text-2xs text-text-secondary">{t.category}</span>
                      ) : (
                        <CategoryPicker value={t.category} categories={PICK_CATEGORIES} title={t.merchant || t.description} busy={busy === `rule-${suggestMatch(t)}`} onPick={(c) => void fileAs(suggestMatch(t), c)} />
                      )}
                    </div>
                  </li>
                )
              })}
              {catTxns.length === 0 && <li className="py-6 text-center text-sm text-text-secondary">No transactions in this category this month.</li>}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
