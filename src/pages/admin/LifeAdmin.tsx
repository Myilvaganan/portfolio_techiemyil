import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Car, Check, FileBadge, HeartPulse, Home, Landmark, Plus, ReceiptText, ShieldCheck, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty, Field, Loading, Notice, PageHero, Panel, Stat, SwipeRow, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useLocale } from '@/lib/locale'
import { useGrowthDoc, type LifeCategory, type LifeItem } from '@/lib/growthApi'
import { complete, dueList, type Bucket, type DueItem } from '@/lib/growth/lifeAdmin'
import { todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Growth',
    title: 'Life Admin',
    lede: 'Passports, licences, insurance, PUC, KYC, tax dates — every deadline in one list, with repeating ones that roll themselves forward.',
    loading: 'Loading your deadlines…',
    overdue: 'Overdue',
    soon: 'Next 30 days',
    later: 'Later',
    done: 'Done',
    add: 'Add a deadline',
    what: 'What',
    whatPh: 'e.g. Car insurance renewal',
    category: 'Type',
    due: 'Due date',
    repeat: 'Repeats every',
    repeatNone: 'Once',
    repeatMonths: (n: number) => (n === 12 ? 'Year' : n === 24 ? '2 years' : n === 60 ? '5 years' : n === 120 ? '10 years' : n === 6 ? '6 months' : `${n} months`),
    notes: 'Notes',
    addBtn: 'Add',
    markDone: 'Done',
    remove: 'Delete',
    dueIn: (d: number) => (d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `In ${d} days`),
    overdueBy: (d: number) => `${d} day${d === 1 ? '' : 's'} late`,
    auto: 'Automatic',
    none: 'Nothing here.',
    empty: 'No deadlines yet — add your passport, licence and insurance renewals.',
  },
  {
    eyebrow: 'வளர்ச்சி',
    title: 'வாழ்க்கை நிர்வாகம்',
    lede: 'பாஸ்போர்ட், உரிமம், காப்பீடு, PUC, KYC, வரித் தேதிகள் — எல்லா காலக்கெடுவும் ஒரே பட்டியலில்.',
    loading: 'ஏற்றுகிறது…',
    overdue: 'தாமதமானவை',
    soon: 'அடுத்த 30 நாட்கள்',
    later: 'பின்னர்',
    done: 'முடிந்தவை',
    add: 'காலக்கெடுவைச் சேர்',
    what: 'என்ன',
    whatPh: 'எ.கா. கார் காப்பீடு புதுப்பித்தல்',
    category: 'வகை',
    due: 'கடைசி தேதி',
    repeat: 'மீண்டும்',
    repeatNone: 'ஒருமுறை',
    repeatMonths: (n: number) => (n === 12 ? 'ஆண்டு' : n === 24 ? '2 ஆண்டுகள்' : n === 60 ? '5 ஆண்டுகள்' : n === 120 ? '10 ஆண்டுகள்' : `${n} மாதங்கள்`),
    notes: 'குறிப்புகள்',
    addBtn: 'சேர்',
    markDone: 'முடிந்தது',
    remove: 'நீக்கு',
    dueIn: (d: number) => (d === 0 ? 'இன்று' : d === 1 ? 'நாளை' : `${d} நாட்களில்`),
    overdueBy: (d: number) => `${d} நாட்கள் தாமதம்`,
    auto: 'தானியங்கி',
    none: 'எதுவும் இல்லை.',
    empty: 'இன்னும் காலக்கெடு இல்லை.',
  },
)

const CATEGORIES: { id: LifeCategory; en: string; ta: string; icon: typeof Car }[] = [
  { id: 'identity', en: 'ID & documents', ta: 'அடையாள ஆவணங்கள்', icon: FileBadge },
  { id: 'vehicle', en: 'Vehicle', ta: 'வாகனம்', icon: Car },
  { id: 'insurance', en: 'Insurance', ta: 'காப்பீடு', icon: ShieldCheck },
  { id: 'tax', en: 'Tax', ta: 'வரி', icon: ReceiptText },
  { id: 'home', en: 'Home', ta: 'வீடு', icon: Home },
  { id: 'finance', en: 'Bank & KYC', ta: 'வங்கி & KYC', icon: Landmark },
  { id: 'health', en: 'Health', ta: 'உடல்நலம்', icon: HeartPulse },
  { id: 'other', en: 'Other', ta: 'மற்றவை', icon: Tag },
]
const REPEATS = [0, 6, 12, 24, 60, 120]
const TAX_TA: Record<string, string> = {
  'tax-itr': 'வருமான வரி தாக்கல் (ITR) கடைசி நாள்',
  'tax-adv1': 'முன்கூட்டிய வரி — ஆண்டின் 15%',
  'tax-adv2': 'முன்கூட்டிய வரி — ஆண்டின் 45%',
  'tax-adv3': 'முன்கூட்டிய வரி — ஆண்டின் 75%',
  'tax-adv4': 'முன்கூட்டிய வரி — ஆண்டின் 100%',
}
const BUCKETS: Bucket[] = ['overdue', 'soon', 'later', 'done']
const blank = (): LifeItem => ({ id: '', title: '', category: 'identity', dueDate: '', repeatMonths: 12, notes: '', done: false })

export function LifeAdmin() {
  const s = useS()
  const { language } = useLocale()
  const doc = useGrowthDoc('life-admin')
  const [draft, setDraft] = useState<LifeItem>(blank)
  const today = todayStr()
  const list = useMemo(() => dueList(doc.value.items, today), [doc.value.items, today])
  const byBucket = (b: Bucket) => list.filter((i) => i.bucket === b)
  const cat = (id: LifeCategory) => CATEGORIES.find((c) => c.id === id)!

  const saveItems = (items: LifeItem[]) => doc.save({ items })
  const add = async () => {
    if (!draft.title.trim() || !draft.dueDate) return
    await saveItems([...doc.value.items, { ...draft, id: Math.random().toString(36).slice(2, 10) }])
    setDraft(blank())
  }
  const markDone = (i: DueItem) => saveItems(doc.value.items.map((x) => (x.id === i.id ? complete(x, today) : x)))
  const remove = (i: DueItem) => saveItems(doc.value.items.filter((x) => x.id !== i.id))

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      {doc.loading ? (
        <Loading label={s.loading} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={s.overdue} tone={byBucket('overdue').length ? 'bad' : 'good'} value={byBucket('overdue').length} />
            <Stat label={s.soon} tone={byBucket('soon').length ? 'warn' : 'neutral'} value={byBucket('soon').length} />
            <Stat label={s.later} value={byBucket('later').length} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {doc.value.items.length === 0 && <Empty title={s.empty} />}
              {BUCKETS.filter((b) => b !== 'done' || byBucket('done').length).map((b) => (
                <Panel key={b} title={s[b]}>
                  {byBucket(b).length === 0 ? (
                    <p className="text-sm text-text-secondary">{s.none}</p>
                  ) : (
                    <ul className="space-y-2">
                      <AnimatePresence initial={false}>
                        {byBucket(b).map((i) => {
                          const c = cat(i.category)
                          const Icon = c.icon
                          return (
                            <motion.li key={i.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                            <SwipeRow
                              right={!i.builtIn && !i.done ? { label: s.markDone, icon: <Check className="h-4 w-4" />, tone: 'good', onTrigger: () => markDone(i) } : undefined}
                              left={!i.builtIn ? { label: s.remove, icon: <Trash2 className="h-4 w-4" />, tone: 'bad', onTrigger: () => remove(i) } : undefined}
                            >
                            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                              <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', b === 'overdue' ? 'bg-error/15 text-error' : b === 'soon' ? 'bg-amber-500/15 text-amber-500' : 'bg-accent/12 text-accent')}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className={cn('truncate text-sm font-medium', i.done ? 'text-text-secondary line-through' : 'text-text')}>{language === 'ta' && i.builtIn ? (TAX_TA[i.id] ?? i.title) : i.title}</p>
                                <p className="text-xs text-text-secondary">
                                  {i.dueDate} · {i.daysLeft < 0 ? s.overdueBy(-i.daysLeft) : s.dueIn(i.daysLeft)} · {language === 'ta' ? c.ta : c.en}
                                  {i.repeatMonths > 0 && ` · ↻ ${s.repeatMonths(i.repeatMonths)}`}
                                  {i.builtIn && <span className="ml-1.5 rounded-full border border-border px-1.5 py-px text-2xs">{s.auto}</span>}
                                </p>
                                {i.notes && <p className="mt-0.5 truncate text-2xs text-text-secondary">{i.notes}</p>}
                              </div>
                              {!i.builtIn && !i.done && (
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => markDone(i)} aria-label={`${s.markDone}: ${i.title}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-positive/50 hover:text-positive">
                                    <Check className="h-3.5 w-3.5" /> {s.markDone}
                                  </button>
                                  <button type="button" onClick={() => remove(i)} aria-label={`${s.remove}: ${i.title}`} className="rounded-lg p-1.5 text-text-secondary hover:text-error">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            </SwipeRow>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  )}
                </Panel>
              ))}
            </div>

            <Panel title={s.add}>
              <div className="space-y-3">
                <Field label={s.what}>
                  <input className={inputCls} value={draft.title} maxLength={100} placeholder={s.whatPh} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
                <Field label={s.category}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CATEGORIES.filter((c) => c.id !== 'tax').map((c) => {
                      const Icon = c.icon
                      return (
                        <button key={c.id} type="button" title={language === 'ta' ? c.ta : c.en} aria-pressed={draft.category === c.id} onClick={() => setDraft({ ...draft, category: c.id })} className={cn('flex h-10 items-center justify-center rounded-xl border', draft.category === c.id ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-text-secondary')}>
                          <Icon className="h-4 w-4" />
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label={s.due}>
                  <input type="date" className={inputCls} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
                </Field>
                <Field label={s.repeat}>
                  <select className={inputCls} value={draft.repeatMonths} onChange={(e) => setDraft({ ...draft, repeatMonths: Number(e.target.value) })}>
                    {REPEATS.map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? s.repeatNone : s.repeatMonths(r)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={s.notes}>
                  <input className={inputCls} value={draft.notes} maxLength={500} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </Field>
                <Button size="sm" magnetic={false} onClick={add} disabled={!draft.title.trim() || !draft.dueDate || doc.saving}>
                  <Plus className="h-4 w-4" /> {s.addBtn}
                </Button>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
