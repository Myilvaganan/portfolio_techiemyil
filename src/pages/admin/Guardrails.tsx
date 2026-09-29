import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Bars, CountUp, Empty, Field, Loading, Notice, PageHero, Panel, Stat, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useLocale } from '@/lib/locale'
import { useMoney } from '@/lib/privacy'
import { saveSettings } from '@/lib/journalStore'
import { useGrowthDoc, type GuardrailRules } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { breachesByMonth, checkGuardrails, type BreachKind } from '@/lib/growth/guardrails'
import { monthLabel, todayStr, type JournalSettings } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Trading',
    title: 'Trading Guardrails',
    lede: 'Hard limits for every trade, day and week — and an honest record of when they were kept.',
    loading: 'Checking your trades against the rules…',
    rules: 'Your rules',
    rulesHint: 'Leave a rule at 0 to switch it off. Day rules are shared with the Trading Journal.',
    perTrade: 'Max loss per trade (₹)',
    perDay: 'Max loss per day (₹)',
    perWeek: 'Max loss per week (₹)',
    tradesDay: 'Max trades per day',
    streak: 'Stop after losses in a row',
    qty: 'Max quantity per trade',
    qtyHint: 'Rupee trades only (units, not lots).',
    cooldown: 'Cool-off days after a break',
    save: 'Save rules',
    saving: 'Saving…',
    saved: 'Rules saved.',
    discipline: 'Discipline',
    disciplineSub: 'Trading days with no rule broken',
    thisMonth: 'Breaks this month',
    cost: 'Cost of breaking rules',
    costSub: 'Losses beyond your limits, all time',
    ifCapped: 'If every loss stopped at the cap',
    ifCappedSub: (actual: string) => `Actual: ${actual} · real stops can slip`,
    noCap: 'Set a per-trade limit to see this',
    calendar: 'Last 12 weeks',
    calendarHint: 'Gold: rules kept · Red: a rule broken · Empty: no trades',
    byMonth: 'Breaks by month',
    recent: 'Recent breaks',
    none: 'No breaks — every trade stayed inside your rules.',
    noTrades: 'No trades in the journal yet.',
    checklist: 'Before you place a trade',
    checklistHint: 'Tick every line. It resets each time you open this page.',
    ready: 'Ready — trade your plan.',
    notReady: (n: number) => `${n} left to tick`,
  },
  {
    eyebrow: 'வர்த்தகம்',
    title: 'வர்த்தக வரம்புகள்',
    lede: 'ஒவ்வொரு வர்த்தகம், நாள், வாரத்திற்கும் கடுமையான வரம்புகள் — அவை எப்போது கடைப்பிடிக்கப்பட்டன என்ற நேர்மையான பதிவு.',
    loading: 'உங்கள் வர்த்தகங்கள் சரிபார்க்கப்படுகின்றன…',
    rules: 'உங்கள் விதிகள்',
    rulesHint: 'விதியை முடக்க 0 ஆக விடவும். நாள் விதிகள் வர்த்தக நாட்குறிப்புடன் பகிரப்படும்.',
    perTrade: 'ஒரு வர்த்தகத்தில் அதிகபட்ச இழப்பு (₹)',
    perDay: 'ஒரு நாளில் அதிகபட்ச இழப்பு (₹)',
    perWeek: 'ஒரு வாரத்தில் அதிகபட்ச இழப்பு (₹)',
    tradesDay: 'ஒரு நாளில் அதிகபட்ச வர்த்தகங்கள்',
    streak: 'தொடர் இழப்புகளுக்குப் பின் நிறுத்து',
    qty: 'ஒரு வர்த்தகத்தில் அதிகபட்ச அளவு',
    qtyHint: 'ரூபாய் வர்த்தகங்களுக்கு மட்டும்.',
    cooldown: 'விதி மீறலுக்குப் பின் ஓய்வு நாட்கள்',
    save: 'விதிகளைச் சேமி',
    saving: 'சேமிக்கிறது…',
    saved: 'விதிகள் சேமிக்கப்பட்டன.',
    discipline: 'ஒழுக்கம்',
    disciplineSub: 'விதி மீறப்படாத வர்த்தக நாட்கள்',
    thisMonth: 'இந்த மாத மீறல்கள்',
    cost: 'விதி மீறலின் விலை',
    costSub: 'வரம்புகளுக்கு மேல் ஏற்பட்ட இழப்பு',
    ifCapped: 'ஒவ்வொரு இழப்பும் வரம்பில் நின்றிருந்தால்',
    ifCappedSub: (actual: string) => `உண்மையானது: ${actual}`,
    noCap: 'இதைப் பார்க்க ஒரு வர்த்தக வரம்பை அமைக்கவும்',
    calendar: 'கடந்த 12 வாரங்கள்',
    calendarHint: 'தங்கம்: விதிகள் கடைப்பிடிக்கப்பட்டன · சிவப்பு: மீறல்',
    byMonth: 'மாதவாரியான மீறல்கள்',
    recent: 'சமீபத்திய மீறல்கள்',
    none: 'மீறல்கள் இல்லை.',
    noTrades: 'நாட்குறிப்பில் இன்னும் வர்த்தகங்கள் இல்லை.',
    checklist: 'வர்த்தகம் செய்வதற்கு முன்',
    checklistHint: 'ஒவ்வொரு வரியையும் டிக் செய்யவும்.',
    ready: 'தயார் — உங்கள் திட்டப்படி வர்த்தகம் செய்யுங்கள்.',
    notReady: (n: number) => `இன்னும் ${n} உள்ளன`,
  },
)

const KIND_LABELS: Record<'en' | 'ta', Record<BreachKind, string>> = {
  en: {
    'trade-loss': 'Loss over per-trade cap',
    'trade-size': 'Size over cap',
    'day-loss': 'Daily loss limit hit',
    'day-count': 'Too many trades',
    'loss-streak': 'Losing streak',
    'week-loss': 'Weekly loss limit hit',
    cooldown: 'Traded during cool-off',
  },
  ta: {
    'trade-loss': 'வர்த்தக வரம்பை மீறிய இழப்பு',
    'trade-size': 'அளவு வரம்பை மீறியது',
    'day-loss': 'நாள் இழப்பு வரம்பு',
    'day-count': 'அதிக வர்த்தகங்கள்',
    'loss-streak': 'தொடர் இழப்புகள்',
    'week-loss': 'வார இழப்பு வரம்பு',
    cooldown: 'ஓய்வு நாளில் வர்த்தகம்',
  },
}

const DEFAULT_CHECKLIST = ['Stop-loss decided before entry', 'Size fits the per-trade loss cap', 'This setup is in my plan', 'Not trading to win back a loss', 'Slept and feeling calm']

type Draft = GuardrailRules & Pick<JournalSettings, 'dailyLossLimit' | 'maxTradesPerDay' | 'maxConsecutiveLosses'>

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <input type="number" min={0} inputMode="numeric" className={inputCls} value={value || ''} placeholder="0" onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
}

/** 12 weeks × 7 days of small squares, newest week on the right. */
function Heatmap({ status }: { status: Map<string, 'clean' | 'breach'> }) {
  const today = todayStr()
  const end = new Date(`${today}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + (6 - ((end.getUTCDay() + 6) % 7)))
  const cells: string[] = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    cells.push(d.toISOString().slice(0, 10))
  }
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1.5" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }} role="img" aria-label="Rule record for the last 12 weeks">
      {cells.map((date, i) => {
        const s = status.get(date)
        return (
          <motion.span
            key={date}
            title={`${date}${s ? ` · ${s}` : ''}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.006, duration: 0.3 }}
            className={cn(
              'aspect-square w-full max-w-7 justify-self-center rounded-[5px]',
              date > today ? 'bg-transparent' : s === 'clean' ? 'bg-accent shadow-[0_0_8px_rgb(var(--aurum-glow)/0.5)]' : s === 'breach' ? 'bg-error' : 'bg-surface-7',
            )}
          />
        )
      })}
    </div>
  )
}

export function Guardrails() {
  const s = useS()
  const m = useMoney()
  const { language: lang } = useLocale()
  const doc = useGrowthDoc('guardrails')
  const { data, loading, errors } = useSources(['trades', 'settings'])
  const [settings, setSettings] = useState<JournalSettings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (data.settings) setSettings(data.settings)
  }, [data.settings])

  useEffect(() => {
    if (!doc.loading && settings && !draft) {
      setDraft({ ...doc.value, dailyLossLimit: settings.dailyLossLimit, maxTradesPerDay: settings.maxTradesPerDay, maxConsecutiveLosses: settings.maxConsecutiveLosses })
    }
  }, [doc.loading, doc.value, settings, draft])

  const report = useMemo(() => (data.trades && settings ? checkGuardrails(data.trades, settings, doc.value) : null), [data.trades, settings, doc.value])
  const months = useMemo(() => (report ? breachesByMonth(report.breaches) : []), [report])
  const status = useMemo(() => new Map(report?.days.map((d) => [d.date, d.status]) ?? []), [report])
  const thisMonth = todayStr().slice(0, 7)
  const checklist = doc.value.checklist.length ? doc.value.checklist : DEFAULT_CHECKLIST

  async function save() {
    if (!draft || !settings) return
    const { dailyLossLimit, maxTradesPerDay, maxConsecutiveLosses, ...rules } = draft
    const nextSettings = { ...settings, dailyLossLimit, maxTradesPerDay, maxConsecutiveLosses }
    await Promise.all([doc.save(rules), saveSettings(nextSettings).then(setSettings)])
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="bad">{errors.join(' · ')}</Notice>}
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}

      {loading || !report ? (
        <Loading label={s.loading} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={s.discipline}
              tone={report.cleanPct === null ? 'neutral' : report.cleanPct >= 80 ? 'good' : report.cleanPct >= 50 ? 'warn' : 'bad'}
              value={report.cleanPct === null ? '—' : <CountUp value={report.cleanPct} format={(n) => `${n.toFixed(0)}%`} />}
              sub={s.disciplineSub}
            />
            <Stat label={s.thisMonth} tone={months[0]?.month === thisMonth && months[0].count > 0 ? 'bad' : 'good'} value={months.find((x) => x.month === thisMonth)?.count ?? 0} sub={monthLabel(thisMonth)} />
            <Stat label={s.cost} tone={report.costOfBreaches > 0 ? 'bad' : 'good'} value={<CountUp value={report.costOfBreaches} format={(n) => m.inr(n)} />} sub={s.costSub} />
            <Stat
              label={s.ifCapped}
              tone="gold"
              value={report.cappedNet === null ? '—' : <CountUp value={report.cappedNet} format={(n) => m.signed(n)} />}
              sub={report.cappedNet === null ? s.noCap : s.ifCappedSub(m.signed(report.actualNet))}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Panel title={s.calendar} hint={s.calendarHint}>
                {report.days.length ? <Heatmap status={status} /> : <Empty title={s.noTrades} />}
              </Panel>

              <Panel title={s.recent}>
                {report.breaches.length === 0 ? (
                  <Empty title={s.none} />
                ) : (
                  <ul className="divide-y divide-border">
                    {report.breaches.slice(0, 12).map((b, i) => (
                      <motion.li
                        key={`${b.date}-${b.kind}-${b.tradeId ?? i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-text">{KIND_LABELS[lang][b.kind]}</span>
                          <span className="ml-2 text-xs text-text-secondary">
                            {b.date}
                            {b.symbol ? ` · ${b.symbol}` : ''}
                          </span>
                        </span>
                        <span className="font-mono text-xs text-text-secondary">
                          {['trade-loss', 'day-loss', 'week-loss'].includes(b.kind) ? `${m.inr(b.value)} / ${m.inr(b.limit)}` : `${b.value} / ${b.limit}`}
                          {b.cost > 0 && <span className="ml-2 text-error">−{m.inr(b.cost)}</span>}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Panel>

              {months.length > 0 && (
                <Panel title={s.byMonth}>
                  <Bars rows={months.slice(0, 8).map((x) => ({ label: monthLabel(x.month), value: -x.cost, sub: `· ${x.count}` }))} format={(n) => m.inr(n)} />
                </Panel>
              )}
            </div>

            <div className="space-y-4">
              <Panel title={s.checklist} hint={s.checklistHint}>
                <ul className="space-y-1.5">
                  {checklist.map((item, i) => {
                    const on = ticked.has(i)
                    return (
                      <li key={item}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setTicked((prev) => {
                            const next = new Set(prev)
                            if (on) next.delete(i)
                            else next.add(i)
                            return next
                          })}
                          className={cn('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors', on ? 'border-accent/40 bg-accent/10 text-text' : 'border-border bg-surface-2 text-text-secondary hover:text-text')}
                        >
                          {on ? <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" /> : <Circle className="h-4 w-4 shrink-0" />}
                          {item}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className={cn('mt-3 flex items-center gap-1.5 text-sm font-medium', ticked.size === checklist.length ? 'text-positive' : 'text-text-secondary')}>
                  <ShieldCheck className="h-4 w-4" /> {ticked.size === checklist.length ? s.ready : s.notReady(checklist.length - ticked.size)}
                </p>
              </Panel>

              {draft && (
                <Panel title={s.rules} hint={s.rulesHint}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={s.perTrade}>
                      <NumberInput value={draft.maxLossPerTrade} onChange={set('maxLossPerTrade')} />
                    </Field>
                    <Field label={s.perDay}>
                      <NumberInput value={draft.dailyLossLimit} onChange={set('dailyLossLimit')} />
                    </Field>
                    <Field label={s.perWeek}>
                      <NumberInput value={draft.weeklyLossLimit} onChange={set('weeklyLossLimit')} />
                    </Field>
                    <Field label={s.tradesDay}>
                      <NumberInput value={draft.maxTradesPerDay} onChange={set('maxTradesPerDay')} />
                    </Field>
                    <Field label={s.streak}>
                      <NumberInput value={draft.maxConsecutiveLosses} onChange={set('maxConsecutiveLosses')} />
                    </Field>
                    <Field label={s.qty} hint={s.qtyHint}>
                      <NumberInput value={draft.maxQtyPerTrade} onChange={set('maxQtyPerTrade')} />
                    </Field>
                    <Field label={s.cooldown}>
                      <NumberInput value={draft.cooldownDays} onChange={set('cooldownDays')} />
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button size="sm" magnetic={false} onClick={save} disabled={doc.saving}>
                      {doc.saving ? s.saving : s.save}
                    </Button>
                    {saved && <span className="text-xs text-positive">{s.saved}</span>}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
