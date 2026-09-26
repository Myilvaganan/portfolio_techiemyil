import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Calculator, X } from 'lucide-react'
import { positionSize } from '@/lib/positionSizing'
import { useMoney } from '@/lib/privacy'
import { Field, inputClass } from './parts'

function Form() {
  const m = useMoney()
  const [accountSize, setAccountSize] = useState('')
  const [riskPct, setRiskPct] = useState('1')
  const [entry, setEntry] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [lotSize, setLotSize] = useState('1')

  const result = useMemo(
    () =>
      positionSize({
        accountSize: Number(accountSize) || 0,
        riskPct: Number(riskPct) || 0,
        entry: Number(entry) || 0,
        stopLoss: Number(stopLoss) || 0,
        lotSize: Number(lotSize) || 0,
      }),
    [accountSize, riskPct, entry, stopLoss, lotSize],
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account size (₹)">
          <input type="number" className={inputClass} value={accountSize} placeholder="e.g. 500000" onChange={(e) => setAccountSize(e.target.value)} />
        </Field>
        <Field label="Risk this trade (%)">
          <input type="number" step="0.1" className={inputClass} value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
        </Field>
        <Field label="Entry price">
          <input type="number" step="any" className={inputClass} value={entry} onChange={(e) => setEntry(e.target.value)} />
        </Field>
        <Field label="Stop loss">
          <input type="number" step="any" className={inputClass} value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
        </Field>
        <Field label="Lot size" hint="units per lot" className="col-span-2">
          <input type="number" step="any" className={inputClass} value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-3 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Lots</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text">{result ? result.lots : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Quantity</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text">{result ? result.qty : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-secondary">Rupees at risk</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text">{result ? m.inr(result.rupeesAtRisk) : '—'}</p>
        </div>
      </div>
      {result && result.lots === 0 && <p className="text-xs text-amber-500">Even one lot risks more than your budget — widen the stop, reduce the lot size, or accept a larger risk %.</p>}
      {!result && <p className="text-xs text-text-secondary">Enter account size, risk %, entry and a stop loss (different from entry) to size the trade.</p>}
    </div>
  )
}

export function PositionSizeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-native-cursor className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          data-native-cursor
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[151] w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-1.5 font-display text-lg font-semibold text-text">
              <Calculator className="h-4 w-4 text-accent" /> Position size
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-text-secondary hover:text-text">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {open && <Form />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
