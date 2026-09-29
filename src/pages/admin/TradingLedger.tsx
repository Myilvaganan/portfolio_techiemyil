import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Bars, CountUp, Empty, Loading, Notice, PageHero, Panel, Stat } from '@/components/growth/kit'
import { defineStrings } from '@/lib/i18n'
import { useMoney } from '@/lib/privacy'
import { useSources } from '@/lib/growth/sources'
import { buildLedger } from '@/lib/growth/ledger'
import { monthLabel, todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Trading',
    title: 'Trading vs Life',
    lede: 'What trading really cost in your own terms — rent, EMIs and the goals you are saving for.',
    loading: 'Reading your statements and trades…',
    netSent: 'Net sent to brokers',
    netSentSub: 'Money in minus money back, all time',
    last12: 'Last 12 months',
    last12Sub: 'Net sent to brokers',
    pnl: 'Journal P&L',
    pnlSub: 'Realised, after charges',
    equals: 'That is',
    rent: (n: string) => `${n} months of rent`,
    emi: (n: string) => `${n} months of all your EMIs`,
    noLoss: 'More came back from brokers than went in. Nothing lost to trading.',
    goals: 'Against your goals',
    goalsHint: 'The net outflow as a share of each goal’s target.',
    goalMonths: (n: string) => `${n} months of saving`,
    noGoals: 'Add goals to see this.',
    prepay: 'If it had gone to your costliest loan',
    prepayText: (loan: string, rate: string, amount: string) => `Prepaying ${loan} (${rate}%) would save about ${amount} a year in interest.`,
    prepayNote: 'Simple-interest estimate; the Loans page has the exact prepayment maths.',
    monthly: 'Month by month',
    monthlyHint: 'Net sent to brokers (bars) and journal P&L.',
    gapNote: 'Cash moved and P&L differ while money sits in a broker account or trades are missing from the journal.',
    empty: 'No broker transfers or trades found yet.',
  },
  {
    eyebrow: 'வர்த்தகம்',
    title: 'வர்த்தகம் vs வாழ்க்கை',
    lede: 'வர்த்தகம் உண்மையில் எவ்வளவு செலவானது — வாடகை, EMI, உங்கள் இலக்குகளின் அடிப்படையில்.',
    loading: 'அறிக்கைகள் படிக்கப்படுகின்றன…',
    netSent: 'தரகர்களுக்கு நிகரமாக அனுப்பியது',
    netSentSub: 'அனுப்பியது கழித்து திரும்பியது',
    last12: 'கடந்த 12 மாதங்கள்',
    last12Sub: 'தரகர்களுக்கு நிகரமாக அனுப்பியது',
    pnl: 'நாட்குறிப்பு லாப/நஷ்டம்',
    pnlSub: 'கட்டணங்களுக்குப் பின்',
    equals: 'இது',
    rent: (n: string) => `${n} மாத வாடகை`,
    emi: (n: string) => `${n} மாத EMI`,
    noLoss: 'அனுப்பியதைவிட அதிகம் திரும்ப வந்தது.',
    goals: 'உங்கள் இலக்குகளுடன் ஒப்பீடு',
    goalsHint: 'ஒவ்வொரு இலக்கின் தொகையில் எத்தனை சதவீதம்.',
    goalMonths: (n: string) => `${n} மாத சேமிப்பு`,
    noGoals: 'இதைப் பார்க்க இலக்குகளைச் சேர்க்கவும்.',
    prepay: 'அதிக வட்டிக் கடனுக்குச் சென்றிருந்தால்',
    prepayText: (loan: string, rate: string, amount: string) => `${loan} (${rate}%) முன்கூட்டியே செலுத்தியிருந்தால் ஆண்டுக்கு சுமார் ${amount} வட்டி மிச்சம்.`,
    prepayNote: 'தோராயமான கணக்கு.',
    monthly: 'மாதவாரியாக',
    monthlyHint: 'தரகர்களுக்கு நிகரமாக அனுப்பியது.',
    gapNote: 'பணம் தரகர் கணக்கில் இருக்கும்போது இரண்டும் வேறுபடும்.',
    empty: 'தரகர் பரிமாற்றங்கள் இன்னும் இல்லை.',
  },
)

export function TradingLedger() {
  const s = useS()
  const m = useMoney()
  const { data, loading, errors } = useSources(['bank', 'card', 'trades', 'tags', 'budgets', 'goals', 'loans'])

  const ledger = useMemo(() => {
    if (loading) return null
    return buildLedger({
      txns: [...(data.bank ?? []), ...(data.card ?? [])],
      trades: data.trades ?? [],
      tags: data.tags ?? {},
      budgets: data.budgets ?? {},
      goals: data.goals ?? [],
      loans: data.loans ?? [],
      today: todayStr(),
    })
  }, [loading, data])

  const lost = Math.max(0, ledger?.totalNet ?? 0)
  const fmt1 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {!ledger ? (
        <Loading label={s.loading} />
      ) : ledger.months.length === 0 ? (
        <Empty title={s.empty} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={s.netSent} tone={ledger.totalNet > 0 ? 'bad' : 'good'} value={<CountUp value={ledger.totalNet} format={(n) => m.inr(n)} />} sub={s.netSentSub} />
            <Stat label={s.last12} tone={ledger.last12Net > 0 ? 'bad' : 'good'} value={<CountUp value={ledger.last12Net} format={(n) => m.inr(n)} />} sub={s.last12Sub} />
            <Stat label={s.pnl} tone={ledger.totalPnl < 0 ? 'bad' : 'good'} value={<CountUp value={ledger.totalPnl} format={(n) => m.signed(n)} />} sub={s.pnlSub} />
          </div>

          {/* The headline: the outflow in rent and EMIs, large and plain. */}
          <Panel>
            {lost > 0 ? (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
                <span className="label-caps">{s.equals}</span>
                {ledger.rentMonths !== null && (
                  <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="font-display text-2xl text-text sm:text-3xl">
                    {s.rent(fmt1(ledger.rentMonths))}
                  </motion.span>
                )}
                {ledger.emiMonths !== null && (
                  <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-display text-2xl text-accent sm:text-3xl">
                    {s.emi(fmt1(ledger.emiMonths))}
                  </motion.span>
                )}
              </div>
            ) : (
              <p className="text-sm text-positive">{s.noLoss}</p>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={s.goals} hint={s.goalsHint}>
              {ledger.goals.length === 0 ? (
                <Empty title={s.noGoals} />
              ) : (
                <ul className="space-y-3">
                  {ledger.goals.map((g, i) => (
                    <li key={g.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-text">{g.name}</span>
                        <span className="font-mono text-xs text-text-secondary">
                          {g.pct >= 100 ? `${(g.pct / 100).toFixed(1)}×` : `${g.pct.toFixed(0)}% of`} {m.inr(g.target)}
                          {g.months !== null && ` · ${s.goalMonths(fmt1(g.months))}`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-5">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-error/60 to-error" initial={{ width: 0 }} animate={{ width: `${Math.min(100, g.pct)}%` }} transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {ledger.prepay && (
                <div className="mt-5 rounded-xl border border-accent/25 bg-accent/5 p-3">
                  <p className="label-caps text-accent">{s.prepay}</p>
                  <p className="mt-1 text-sm text-text">{s.prepayText(ledger.prepay.loan, ledger.prepay.ratePct.toFixed(1), m.inr(ledger.prepay.yearlyInterest))}</p>
                  <p className="mt-1 text-2xs text-text-secondary">{s.prepayNote}</p>
                </div>
              )}
            </Panel>

            <Panel title={s.monthly} hint={s.monthlyHint}>
              <Bars rows={[...ledger.months].reverse().slice(0, 12).map((x) => ({ label: monthLabel(x.month), value: -x.net, sub: `· P&L ${m.compact(x.pnl)}` }))} format={(n) => m.signed(n)} />
              <p className="mt-3 text-2xs text-text-secondary">{s.gapNote}</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
