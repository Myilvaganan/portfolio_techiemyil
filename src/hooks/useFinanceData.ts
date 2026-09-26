import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchStatements } from '@/lib/statementsApi'
import { fetchFinance, type FinanceSettings } from '@/lib/financeApi'
import { applyRules } from '@/lib/rules'
import type { Txn } from '@/lib/statements'

const EMPTY: FinanceSettings = { budgets: {}, rules: [], tags: {} }

/** Bank and card transactions with the saved category rules applied, plus the budgets, rules and tags. */
export function useFinanceData() {
  const [raw, setRaw] = useState<{ bank: Txn[]; card: Txn[] } | null>(null)
  const [settings, setSettings] = useState<FinanceSettings>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchStatements('bank'), fetchStatements('card')])
      .then(([b, c]) => !cancelled && setRaw({ bank: b.transactions, card: c.transactions }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your statements.'))
    fetchFinance()
      .then((s) => !cancelled && setSettings(s))
      .catch((e) => !cancelled && setSettingsError(e instanceof Error ? e.message : 'Could not load budgets.'))
    return () => {
      cancelled = true
    }
  }, [])

  const bank = useMemo(() => (raw ? applyRules(raw.bank, settings.rules) : []), [raw, settings.rules])
  const card = useMemo(() => (raw ? applyRules(raw.card, settings.rules) : []), [raw, settings.rules])
  const all = useMemo(() => [...bank, ...card], [bank, card])
  const patch = useCallback((p: Partial<FinanceSettings>) => setSettings((s) => ({ ...s, ...p })), [])

  return { loading: !raw && !error, error, settingsError, bank, card, all, settings, patch }
}
