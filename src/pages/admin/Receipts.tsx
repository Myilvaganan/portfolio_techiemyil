import { useMemo, useRef, useState } from 'react'
import { canEditDay, editableFrom } from '@/lib/locks'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Loader2, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, Stat, inputCls } from '@/components/growth/kit'
import { haptic } from '@/lib/native'
import { useMoney } from '@/lib/privacy'
import { scanReceipt, useGrowthDoc, type Receipt } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { MonthStepper } from '@/components/viz/MonthStepper'

// Photograph a bill: the AI reads the shop, date, total and category, you check it, and it's filed. Good for cash
// spends that never show up in a bank statement.

const CATEGORIES = ['Groceries', 'Food & Dining', 'Fuel', 'Shopping', 'Medical', 'Bills & Utilities', 'Travel', 'Home', 'Education', 'Other']
const newId = () => Math.random().toString(36).slice(2, 10)

/** Shrink a photo to at most 1600px on the long side as a JPEG data URL. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => reject(new Error('That file is not an image.'))
    img.src = url
  })
}

export function Receipts() {
  const m = useMoney()
  const doc = useGrowthDoc('receipts')
  const fileRef = useRef<HTMLInputElement>(null)
  const today = todayStr()
  const blank: Omit<Receipt, 'id'> = { date: today, merchant: '', amount: 0, category: 'Groceries', note: '' }
  const [draft, setDraft] = useState(blank)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(today.slice(0, 7))

  async function scan(file?: File) {
    if (!file) return
    setScanning(true)
    setError(null)
    try {
      const r = await scanReceipt(await shrink(file))
      setDraft({ ...blank, merchant: r.merchant, date: r.date || today, amount: r.amount, category: CATEGORIES.includes(r.category) ? r.category : 'Other' })
      haptic(15)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  const items = doc.value.items
  const inMonth = useMemo(() => items.filter((r) => r.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [items, month])
  const byCat = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of inMonth) map.set(r.category, (map.get(r.category) ?? 0) + r.amount)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inMonth])
  const total = inMonth.reduce((s, r) => s + r.amount, 0)

  if (doc.loading) return <Loading label="Loading receipts…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Money" title="Receipts" lede="Snap a bill and it’s read for you — shop, date, total and category. Ideal for cash spends that don’t show up in statements." />
      {(error || doc.error) && <Notice tone="bad">{error || doc.error}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Panel title="Add a receipt">
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => fileRef.current?.click()} disabled={scanning} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 py-6 text-accent">
            {scanning ? <Loader2 className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}
            <span className="text-sm font-semibold">{scanning ? 'Reading the receipt…' : 'Take or choose a photo'}</span>
          </motion.button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void scan(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          <div className="mt-4 space-y-3">
            <Field label="Shop"><input className={inputCls} value={draft.merchant} maxLength={80} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₹)"><input className={inputCls} inputMode="decimal" value={draft.amount || ''} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} /></Field>
              <Field label="Date"><input type="date" className={inputCls} min={editableFrom(today)} max={today} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
            </div>
            <Field label="Category">
              <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Note"><input className={inputCls} value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            <button type="button" disabled={!draft.amount || !draft.date} onClick={() => { doc.save({ items: [...items, { ...draft, id: newId() }] }); setDraft(blank); haptic(12) }} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
              <Plus className="h-4 w-4" /> Save
            </button>
          </div>
        </Panel>
        <div className="space-y-4">
          <div className="flex justify-end">
            <MonthStepper value={month} max={today.slice(0, 7)} onChange={setMonth} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Spent" value={m.inr(total)} sub="this month" />
            <Stat label="Receipts" value={String(inMonth.length)} sub="saved" />
            <Stat label="Top category" value={byCat[0]?.[0] ?? '—'} sub={byCat[0] ? m.inr(byCat[0][1]) : 'nothing yet'} />
          </div>
          {byCat.length > 0 && (
            <Panel title="By category">
              <div className="space-y-2">
                {byCat.map(([c, v]) => (
                  <div key={c} className="flex items-center gap-3 text-sm">
                    <span className="w-32 truncate text-text">{c}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-5"><motion.span className="block h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(v / total) * 100}%` }} /></span>
                    <span className="w-24 text-right font-mono text-text-secondary">{m.inr(v)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          <Panel title="Receipts" action={<ReceiptText className="h-4 w-4 text-accent" />}>
            {inMonth.length === 0 ? <Empty title="No receipts this month." /> : (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {inMonth.map((r) => (
                    <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 30 }} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                      <span className="w-12 font-mono text-text-secondary">{r.date.slice(8)}/{r.date.slice(5, 7)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-text">{r.merchant || r.category}</span><span className="block truncate text-xs text-text-secondary">{r.category}{r.note ? ` · ${r.note}` : ''}</span></span>
                      <span className="font-mono text-text">{m.inr(r.amount)}</span>
                      {canEditDay(r.date, today) && <button type="button" aria-label="Delete" onClick={() => doc.save({ items: items.filter((x) => x.id !== r.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
