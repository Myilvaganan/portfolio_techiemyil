import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLoanDocs, fetchStatements } from '@/lib/statementsApi'
import { buildLoans } from '@/lib/loans'
import { fetchFinance, type FinanceSettings } from '@/lib/financeApi'
import { applyRules, applySmartRules } from '@/lib/rules'
import type { Txn } from '@/lib/statements'

const EMPTY: FinanceSettings = { budgets: {}, rules: [], tags: {} }

/** Bank and card transactions with the saved category rules applied, plus the budgets, rules and tags. */
export function useFinanceData() {
  const [raw, setRaw] = useState<{ bank: Txn[]; card: Txn[] } | null>(null)
  const [settings, setSettings] = useState<FinanceSettings>(EMPTY)
  const [emis, setEmis] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchStatements('bank'), fetchStatements('card')])
      .then(([b, c]) => !cancelled && setRaw({ bank: b.transactions, card: c.transactions }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your statements.'))
    // The EMI of each running loan lets its monthly debit be filed correctly. Optional: without loans nothing changes.
    fetchLoanDocs()
      .then((d) => !cancelled && setEmis(buildLoans(d.statements).map((l) => l.details?.emi ?? 0).filter((e) => e > 0)))
      .catch(() => {})
    fetchFinance()
      .then((s) => !cancelled && setSettings(s))
      .catch((e) => !cancelled && setSettingsError(e instanceof Error ? e.message : 'Could not load budgets.'))
    return () => {
      cancelled = true
    }
  }, [])

  const bank = useMemo(() => (raw ? applyRules(applySmartRules(raw.bank, emis), settings.rules) : []), [raw, settings.rules, emis])
  const card = useMemo(() => (raw ? applyRules(applySmartRules(raw.card), settings.rules) : []), [raw, settings.rules])
  const all = useMemo(() => [...bank, ...card], [bank, card])
  const patch = useCallback((p: Partial<FinanceSettings>) => setSettings((s) => ({ ...s, ...p })), [])

  return { loading: !raw && !error, error, settingsError, bank, card, all, settings, patch }
}
