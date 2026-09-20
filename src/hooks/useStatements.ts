import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aiContext, emptyStatements, fingerprint, inPeriod, insightsFingerprint, periodOfFingerprint, presetPeriod, type AiInsights, type AiPeriod, type AiPeriodId, type Options, type StatementKind, type StatementsData } from '@/lib/statements'
import { askAi, deleteStatement, fetchStatements, generateInsights, statementFileUrl } from '@/lib/statementsApi'

// `autoInsights` can be switched off (e.g. while files are still uploading) so the analysis runs once after the last one.
export interface PeriodChoice {
  id: AiPeriodId
  custom: AiPeriod
}

// With a `choice` the AI only sees that slice of the transactions; without one it sees everything.
export function useStatements(kind: StatementKind, options: Options = {}, autoInsights = true, choice?: PeriodChoice) {
  const [data, setData] = useState<StatementsData>(emptyStatements)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<AiInsights | null>(null)
  const [insightsBusy, setInsightsBusy] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const attempted = useRef<string>('')

  const dataPrint = useMemo(() => fingerprint(data.transactions), [data.transactions])
  const period = useMemo(() => (choice ? presetPeriod(choice.id, data.transactions, choice.custom) : null), [choice?.id, choice?.custom.from, choice?.custom.to, data.transactions]) // eslint-disable-line react-hooks/exhaustive-deps
  const print = insightsFingerprint(dataPrint, period)

  const reload = useCallback(async () => {
    try {
      const next = await fetchStatements(kind)
      setData(next)
      setInsights(next.insights)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void reload()
  }, [reload])

  const generate = useCallback(async () => {
    if (!data.transactions.length) return
    if (choice && !period) {
      setInsightsError('Pick a valid from and to date.')
      return
    }
    const scoped = period ? inPeriod(data.transactions, period) : data.transactions
    if (!scoped.length) {
      setInsightsError('There are no transactions in that period.')
      return
    }
    setInsightsBusy(true)
    setInsightsError(null)
    try {
      setInsights(await generateInsights(kind, aiContext(kind, { ...data, transactions: scoped }, options), print))
    } catch (e) {
      setInsightsError((e as Error).message)
    } finally {
      setInsightsBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, data, print, period?.from, period?.to, options.excludeTransfers])

  // Insights are generated once per change to the data, then stored and simply reloaded on the next visit.
  // A saved analysis of another period is still current: it is shown with its period, and only regenerated on request.
  const current = !!insights && (choice ? insights.fingerprint.startsWith(`${dataPrint}|`) : insights.fingerprint === dataPrint)
  const stale = !current
  const shownPeriod = current && insights ? periodOfFingerprint(insights.fingerprint) : null
  const periodMatches = current && insights?.fingerprint === print
  useEffect(() => {
    if (!autoInsights || loading || (choice && !period) || !data.transactions.length || !stale || insightsBusy || attempted.current === print) return
    attempted.current = print
    void generate()
  }, [autoInsights, loading, choice, period, data.transactions.length, stale, insightsBusy, print, generate])

  const ask = useCallback((question: string) => askAi(kind, question, aiContext(kind, data, options)), [kind, data, options])

  const remove = useCallback(
    async (id: string) => {
      await deleteStatement(kind, id)
      await reload()
    },
    [kind, reload],
  )

  const openFile = useCallback(async (id: string) => {
    window.open(await statementFileUrl(kind, id), '_blank', 'noopener')
  }, [kind])

  return { data, loading, error, reload, insights: stale ? null : insights, staleInsights: stale ? insights : null, shownPeriod, periodMatches, period, insightsBusy, insightsError, generate, ask, remove, openFile }
}
