import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty, Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useLocale } from '@/lib/locale'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { monthFigures, prevMonth, takeaways, type MonthFigures, type Takeaway } from '@/lib/growth/review'
import { monthLabel, todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Growth',
    title: 'Monthly Review',
    lede: 'Your month on one page — money, trading, net worth and health — against the month before, with the three things that mattered most.',
    loading: 'Putting your month together…',
    takeaways: 'What mattered',
    spend: 'Spending',
    wants: 'Wants',
    income: 'Salary in',
    trading: 'Trading P&L',
    breaks: 'Rule breaks',
    broker: 'Net sent to brokers',
    netWorth: 'Net worth',
    sleep: 'Avg sleep',
    steps: 'Avg steps',
    vs: (m: string) => `vs ${m}`,
    over: 'Over budget',
    noOver: 'Every budgeted category stayed inside its limit.',
    commit: 'One thing to change next month',
    commitHint: 'Short and specific works best. Next month’s review will ask if you kept it.',
    save: 'Save',
    saved: 'Saved.',
    lastCommit: (m: string) => `Your commitment for ${m}`,
    kept: 'Kept it',
    notKept: 'Didn’t',
    noData: 'No statements or trades for this month yet.',
  },
  {
    eyebrow: 'வளர்ச்சி',
    title: 'மாதாந்திர ஆய்வு',
    lede: 'உங்கள் மாதம் ஒரே பக்கத்தில் — பணம், வர்த்தகம், நிகர மதிப்பு, உடல்நலம் — முந்தைய மாதத்துடன் ஒப்பீடு.',
    loading: 'உங்கள் மாதம் தயாராகிறது…',
    takeaways: 'முக்கியமானவை',
    spend: 'செலவு',
    wants: 'ஆசைச் செலவு',
    income: 'சம்பளம்',
    trading: 'வர்த்தக லாப/நஷ்டம்',
    breaks: 'விதி மீறல்கள்',
    broker: 'தரகர்களுக்கு நிகரமாக',
    netWorth: 'நிகர மதிப்பு',
    sleep: 'சராசரி தூக்கம்',
    steps: 'சராசரி அடிகள்',
    vs: (m: string) => `${m} உடன்`,
    over: 'பட்ஜெட்டை மீறியவை',
    noOver: 'அனைத்தும் பட்ஜெட்டுக்குள்.',
    commit: 'அடுத்த மாதம் மாற்ற வேண்டிய ஒன்று',
    commitHint: 'சுருக்கமாகவும் தெளிவாகவும் எழுதுங்கள்.',
    save: 'சேமி',
    saved: 'சேமிக்கப்பட்டது.',
    lastCommit: (m: string) => `${m} க்கான உங்கள் உறுதி`,
    kept: 'கடைப்பிடித்தேன்',
    notKept: 'இல்லை',
    noData: 'இந்த மாதத்திற்கு தரவு இல்லை.',
  },
)

const TAKEAWAY_EN: Record<Takeaway['key'], (v: string, l?: string) => string> = {
  overBudget: (v: string, l?: string) => `${l} went ${v} over budget.`,
  underBudget: () => 'Every budgeted category stayed inside its limit.',
  tradingLoss: (v: string) => `Trading lost ${v}.`,
  tradingWin: (v: string) => `Trading made ${v}.`,
  breaks: (v: string, l?: string) => `${l} rule breaks cost ${v}.`,
  noBreaks: (v: string) => `No trading rule broken across ${v} trades.`,
  netWorthUp: (v: string) => `Net worth grew ${v}.`,
  netWorthDown: (v: string) => `Net worth fell ${v}.`,
  wantsUp: (v: string) => `Spending on wants rose ${v} from last month.`,
  wantsDown: (v: string) => `Spending on wants fell ${v} from last month.`,
}

const TAKEAWAY_TA: Record<Takeaway['key'], (v: string, l?: string) => string> = {
  overBudget: (v, l) => `${l} பட்ஜெட்டை ${v} மீறியது.`,
  underBudget: () => 'அனைத்து வகைகளும் பட்ஜெட்டுக்குள் இருந்தன.',
  tradingLoss: (v) => `வர்த்தகத்தில் ${v} இழப்பு.`,
  tradingWin: (v) => `வர்த்தகத்தில் ${v} லாபம்.`,
  breaks: (v, l) => `${l} விதி மீறல்களின் விலை ${v}.`,
  noBreaks: (v) => `${v} வர்த்தகங்களில் விதி மீறல் இல்லை.`,
  netWorthUp: (v) => `நிகர மதிப்பு ${v} உயர்ந்தது.`,
  netWorthDown: (v) => `நிகர மதிப்பு ${v} குறைந்தது.`,
  wantsUp: (v) => `ஆசைச் செலவு ${v} அதிகரித்தது.`,
  wantsDown: (v) => `ஆசைச் செலவு ${v} குறைந்தது.`,
}

type Row = { label: string; cur: number | null; prev: number | null; fmt: (n: number) => string; betterUp: boolean }

function Compare({ row, i }: { row: Row; i: number }) {
  const d = row.cur !== null && row.prev !== null ? row.cur - row.prev : null
  const good = d === null || d === 0 ? null : d > 0 === row.betterUp
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="label-caps">{row.label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-text">{row.cur === null ? '—' : row.fmt(row.cur)}</p>
      {d !== null && d !== 0 && (
        <p className={cn('mt-0.5 flex items-center gap-0.5 text-2xs font-medium', good ? 'text-positive' : 'text-error')}>
          {d > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {row.fmt(Math.abs(d))}
        </p>
      )}
    </motion.div>
  )
}

export function MonthlyReview() {
  const s = useS()
  const m = useMoney()
  const doc = useGrowthDoc('reviews')
  const rules = useGrowthDoc('guardrails')
  const { data, loading, errors } = useSources(['bank', 'card', 'trades', 'tags', 'budgets', 'snapshots', 'health', 'settings'])
  const [month, setMonth] = useState(prevMonth(todayStr().slice(0, 7)))
  const [commitment, setCommitment] = useState('')
  const [saved, setSaved] = useState(false)

  const figures = useMemo(() => {
    if (loading || !data.settings) return null
    const input = { txns: [...(data.bank ?? []), ...(data.card ?? [])], trades: data.trades ?? [], tags: data.tags ?? {}, budgets: data.budgets ?? {}, snapshots: data.snapshots ?? [], health: data.health ?? [], settings: data.settings, rules: rules.value }
    return { cur: monthFigures(month, input), prev: monthFigures(prevMonth(month), input) }
  }, [loading, data, month, rules.value])

  useEffect(() => setCommitment(doc.value.months[month]?.commitment ?? ''), [doc.value, month])

  const last = doc.value.months[prevMonth(month)]
  const list = figures ? takeaways(figures.cur, figures.prev) : []
  const { language } = useLocale()
  const sentence = language === 'ta' ? TAKEAWAY_TA : TAKEAWAY_EN

  const rows = (c: MonthFigures, p: MonthFigures): Row[] => [
    { label: s.spend, cur: c.spend, prev: p.spend, fmt: (n) => m.inr(n), betterUp: false },
    { label: s.wants, cur: c.wants, prev: p.wants, fmt: (n) => m.inr(n), betterUp: false },
    { label: s.income, cur: c.income, prev: p.income, fmt: (n) => m.inr(n), betterUp: true },
    { label: s.trading, cur: c.tradingPnl, prev: p.tradingPnl, fmt: (n) => m.signed(n), betterUp: true },
    { label: s.breaks, cur: c.breaks, prev: p.breaks, fmt: (n) => String(n), betterUp: false },
    { label: s.broker, cur: c.brokerNet, prev: p.brokerNet, fmt: (n) => m.inr(n), betterUp: false },
    { label: s.netWorth, cur: c.netWorth, prev: p.netWorth, fmt: (n) => m.inr(n), betterUp: true },
    { label: s.sleep, cur: c.sleepAvg, prev: p.sleepAvg, fmt: (n) => `${n.toFixed(1)} h`, betterUp: true },
    { label: s.steps, cur: c.stepsAvg, prev: p.stepsAvg, fmt: (n) => Math.round(n).toLocaleString(), betterUp: true },
  ]

  const saveMonth = async (patch: Partial<{ commitment: string; keptCommitment: boolean | null }>, target = month) => {
    const current = doc.value.months[target] ?? { commitment: '', notes: '', keptCommitment: null }
    await doc.save({ months: { ...doc.value.months, [target]: { ...current, ...patch } } })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <div className="w-full space-y-5">
      <PageHero
        eyebrow={s.eyebrow}
        title={s.title}
        lede={s.lede}
        actions={
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-full border border-border p-2 text-text-secondary hover:text-text">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center font-display text-base text-text">{monthLabel(month)}</span>
            <button type="button" aria-label="Next month" disabled={month >= todayStr().slice(0, 7)} onClick={() => shift(1)} className="rounded-full border border-border p-2 text-text-secondary hover:text-text disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {!figures ? (
        <Loading label={s.loading} />
      ) : figures.cur.spend === 0 && figures.cur.trades === 0 ? (
        <Empty title={s.noData} />
      ) : (
        <>
          <Panel title={s.takeaways}>
            <ol className="space-y-2.5">
              {list.map((t, i) => (
                <motion.li key={t.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }} className="flex items-start gap-3">
                  <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-sm', t.tone === 'good' ? 'bg-positive/15 text-positive' : t.tone === 'bad' ? 'bg-error/15 text-error' : 'bg-surface-5 text-text')}>{i + 1}</span>
                  <p className="font-display text-lg leading-snug text-text sm:text-xl">{sentence[t.key](t.key === 'noBreaks' ? String(t.value) : m.inr(t.value), t.label)}</p>
                </motion.li>
              ))}
            </ol>
          </Panel>

          <div>
            <p className="label-caps mb-2 px-0.5">{s.vs(monthLabel(prevMonth(month)))}</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
              {rows(figures.cur, figures.prev).map((r, i) => (
                <Compare key={r.label} row={r} i={i} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={s.over}>
              {figures.cur.overBudget.length === 0 ? (
                <p className="text-sm text-positive">{s.noOver}</p>
              ) : (
                <ul className="space-y-3">
                  {figures.cur.overBudget.map((o) => (
                    <li key={o.category}>
                      <div className="flex justify-between text-sm">
                        <span className="text-text">{o.category}</span>
                        <span className="font-mono text-xs text-error">
                          {m.inr(o.spent)} / {m.inr(o.limit)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-5">
                        <motion.div className="h-full rounded-full bg-error" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.7 }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={s.commit} hint={s.commitHint}>
              {last?.commitment && (
                <div className="mb-4 rounded-xl border border-accent/25 bg-accent/5 p-3">
                  <p className="label-caps text-accent">{s.lastCommit(monthLabel(prevMonth(month)))}</p>
                  <p className="mt-1 text-sm text-text">“{last.commitment}”</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => saveMonth({ keptCommitment: true }, prevMonth(month))} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', last.keptCommitment === true ? 'border-positive/50 bg-positive/15 text-positive' : 'border-border text-text-secondary')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> {s.kept}
                    </button>
                    <button type="button" onClick={() => saveMonth({ keptCommitment: false }, prevMonth(month))} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', last.keptCommitment === false ? 'border-error/50 bg-error/15 text-error' : 'border-border text-text-secondary')}>
                      <XCircle className="h-3.5 w-3.5" /> {s.notKept}
                    </button>
                  </div>
                </div>
              )}
              <textarea rows={3} maxLength={300} className={inputCls} value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="e.g. No trades after two losses in a day" />
              <div className="mt-3 flex items-center gap-3">
                <Button size="sm" magnetic={false} disabled={doc.saving} onClick={() => saveMonth({ commitment })}>
                  {s.save}
                </Button>
                {saved && <span className="text-xs text-positive">{s.saved}</span>}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
