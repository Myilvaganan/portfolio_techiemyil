import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildLoans, loanAiContext, loanFingerprint, type FeeAssumption, type LoanData } from '@/lib/loans'
import type { AiInsights } from '@/lib/statements'
import { askAi, deleteStatement, fetchLoanDocs, generateInsights, statementFileUrl } from '@/lib/statementsApi'

export function useLoans(fee: FeeAssumption, autoInsights = true) {
  const [data, setData] = useState<LoanData>({ statements: [], insights: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const attempted = useRef('')

  const loans = useMemo(() => buildLoans(data.statements), [data.statements])
  const print = useMemo(() => loanFingerprint(data.statements), [data.statements])

  const reload = useCallback(async () => {
    try {
      const next = await fetchLoanDocs()
      setData(next)
      setInsights(next.insights)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const generate = useCallback(async () => {
    if (!loans.length) return
    setInsightsBusy(true)
    setInsightsError(null)
    try {
      setInsights(await generateInsights('loan', loanAiContext(loans, fee), print))
    } catch (e) {
      setInsightsError((e as Error).message)
    } finally {
      setInsightsBusy(false)
    }
  }, [loans, fee, print])

  // Generated once per change to the documents, then saved and simply reloaded on later visits.
  const stale = !insights || insights.fingerprint !== print
  useEffect(() => {
    if (!autoInsights || loading || !loans.length || !stale || insightsBusy || attempted.current === print) return
    attempted.current = print
    void generate()
  }, [autoInsights, loading, loans.length, stale, insightsBusy, print, generate])

  const ask = useCallback((question: string) => askAi('loan', question, loanAiContext(loans, fee)), [loans, fee])
  const remove = useCallback(
    async (id: string) => {
      await deleteStatement('loan', id)
      await reload()
    },
    [reload],
  )
  const openFile = useCallback(async (id: string) => {
    window.open(await statementFileUrl('loan', id), '_blank', 'noopener')
  }, [])

  return { data, loans, loading, error, reload, insights: stale ? null : insights, insightsBusy, insightsError, generate, ask, remove, openFile }
}
