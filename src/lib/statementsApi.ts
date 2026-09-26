import { clearStoredToken, getStoredToken } from './adminAuth'
import type { AiInsights, Statement, StatementKind, StatementsData } from './statements'
import type { LoanData } from './loans'
import { parseLoanDocument } from './loanParser'

export type VaultKind = StatementKind | 'loan'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL

export class StatementError extends Error {
  code?: string
  uploadId?: string
  prepared?: { id: string; chunks: number }
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function api(path: string, init: RequestInit = {}) {
  const token = getStoredToken()
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new StatementError(data?.error || 'Something went wrong. Please try again.', data?.code)
  return data
}

const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) })

export async function fetchLoanDocs(): Promise<LoanData> {
  const data = await api('/admin/statements/data?kind=loan')
  return { statements: data.statements ?? [], insights: data.insights ?? null }
}

export async function fetchStatements(kind: StatementKind): Promise<StatementsData> {
  const data = await api(`/admin/statements/data?kind=${kind}`)
  return { statements: data.statements ?? [], transactions: data.transactions ?? [], insights: data.insights ?? null, updatedAt: data.updatedAt }
}

export async function deleteStatement(kind: VaultKind, id: string) {
  await api(`/admin/statements?kind=${kind}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function statementFileUrl(kind: VaultKind, id: string): Promise<string> {
  const data = await api(`/admin/statements/file-url?kind=${kind}&id=${encodeURIComponent(id)}`)
  return data.url
}

export async function generateInsights(kind: VaultKind, context: unknown, fingerprint: string): Promise<AiInsights> {
  try {
    return await post('/admin/statements/insights', { kind, context, fingerprint })
  } catch (e) {
    // The strongest model can be slow on big histories; fall back to the faster one rather than failing.
    if (e instanceof StatementError && (e.code === 'ai_timeout' || e.code === 'ai_incomplete')) return post('/admin/statements/insights', { kind, context, fingerprint, fast: true })
    throw e
  }
}

// Re-categorises every transaction with this merchant (and remembers the choice for future statements).
export async function setCategoryOverride(kind: StatementKind, merchant: string, category: string): Promise<{ ok: boolean; updated: number }> {
  return post('/admin/statements/category-override', { kind, merchantKey: merchant, category })
}

export async function askAi(kind: VaultKind, question: string, context: unknown): Promise<string> {
  try {
    return (await post('/admin/statements/ask', { kind, question, context })).answer
  } catch (e) {
    if (e instanceof StatementError && e.code === 'ai_timeout') return (await post('/admin/statements/ask', { kind, question, context, fast: true })).answer
    throw e
  }
}

// ---------- Upload pipeline ----------

export type Stage = 'uploading' | 'unlocking' | 'reading' | 'saving'

export interface Progress {
  stage: Stage
  done?: number
  total?: number
}

async function pool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (e instanceof StatementError && (e.code === 'ai_not_configured' || e.code === 'ai_no_credits')) throw e
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw last
}

export interface ProcessOptions {
  kind: VaultKind
  file: File
  password?: string
  resumeId?: string
  // Set when the file was already unlocked and saved but the AI step failed — retry skips straight to reading.
  prepared?: { id: string; chunks: number }
  onProgress: (p: Progress) => void
}

export const isPdf = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf'

// Uploads to the vault, unlocks the PDF with the one password, reads it with AI, and saves the result.
export async function processStatementFile(opts: ProcessOptions): Promise<{ statement: Statement; replaced: number; label?: string }> {
  if (opts.kind === 'loan') return processLoanFile(opts)
  return processBankOrCardFile({ ...opts, kind: opts.kind })
}

// Loan PDFs need no AI: the server unlocks and extracts text, and the layout is read right here.
async function processLoanFile({ file, password, resumeId, onProgress }: ProcessOptions): Promise<{ statement: Statement; replaced: number; label: string }> {
  let id = resumeId
  if (!id) {
    onProgress({ stage: 'uploading' })
    const up = await post('/admin/statements/upload-url', { kind: 'loan', contentType: 'application/pdf' })
    const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': up.contentType }, body: file })
    if (!put.ok) throw new StatementError('Upload failed. Please try again.')
    id = up.id as string
  }
  onProgress({ stage: 'unlocking' })
  let prep: { pages: number; lines: string[] }
  try {
    prep = await post('/admin/statements/prepare', { kind: 'loan', id, password: password || undefined })
  } catch (e) {
    if (e instanceof StatementError) e.uploadId = id
    throw e
  }
  onProgress({ stage: 'reading', done: 0, total: 1 })
  const parsed = parseLoanDocument(prep.lines)
  if (!parsed.ok) throw new StatementError(parsed.error)
  onProgress({ stage: 'saving' })
  const saved = await post('/admin/statements/commit', { kind: 'loan', id, filename: file.name, pages: prep.pages, parsed: parsed.doc })
  const label = parsed.doc.docType === 'schedule' ? `Amortization schedule · ${parsed.doc.rows.length} instalments` : `Loan statement · ${parsed.doc.events.length} entries`
  return { statement: saved.statement, replaced: saved.replaced, label }
}

async function processBankOrCardFile({ kind, file, password, resumeId, prepared, onProgress }: ProcessOptions & { kind: StatementKind }): Promise<{ statement: Statement; replaced: number }> {
  let id = prepared?.id ?? resumeId
  let prep: { chunks: number } | undefined = prepared
  if (!prep) {
    if (!id) {
      onProgress({ stage: 'uploading' })
      const contentType = isPdf(file) ? 'application/pdf' : 'text/csv'
      const up = await post('/admin/statements/upload-url', { kind, contentType })
      const put = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': up.contentType }, body: file })
      if (!put.ok) throw new StatementError('Upload failed. Please try again.')
      id = up.id as string
    }

    onProgress({ stage: 'unlocking' })
    try {
      prep = await post('/admin/statements/prepare', { kind, id, password: password || undefined })
    } catch (e) {
      if (e instanceof StatementError) e.uploadId = id
      throw e
    }
  }
  const statementId = id as string
  id = statementId
  const chunks = (prep as { chunks: number }).chunks

  const total = chunks + 1
  let done = 0
  onProgress({ stage: 'reading', done, total })
  let meta: unknown
  const transactions: unknown[][] = Array.from({ length: chunks }, () => [])
  const jobs: (number | 'meta')[] = ['meta', ...Array.from({ length: chunks }, (_, i) => i)]
  try {
    await pool(jobs, 3, async (job) => {
      const res = await withRetry(() => post('/admin/statements/extract', { kind, id, chunk: job }))
      if (job === 'meta') meta = res.meta
      else transactions[job] = res.transactions
      onProgress({ stage: 'reading', done: ++done, total })
    })
  } catch (e) {
    if (e instanceof StatementError) {
      e.uploadId = id
      e.prepared = { id: statementId, chunks }
    }
    throw e
  }

  onProgress({ stage: 'saving' })
  const saved = await post('/admin/statements/commit', { kind, id, filename: file.name, meta, transactions: transactions.flat() })
  return { statement: saved.statement, replaced: saved.replaced }
}

// ---------- Statements that arrived by email ----------

export interface InboxItem {
  id: string
  filename: string
  subject: string
  from: string
  receivedAt: string
  size: number
  guess: VaultKind
  status: 'new' | 'ready' | 'done' | 'failed' | 'skipped'
  kind?: VaultKind
  error?: string
}

export interface InboxData {
  items: InboxItem[]
  passwords: { id: string; label: string }[]
  configured: boolean
}

export const fetchInbox = (): Promise<InboxData> => api('/admin/inbox')
export const addInboxPassword = (label: string, password: string) => post('/admin/inbox/passwords', { label, password })
export const removeInboxPassword = (id: string) => api(`/admin/inbox/passwords?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
export const skipInboxItem = (id: string) => post('/admin/inbox/skip', { id })

/**
 * Reads one emailed statement with the same steps as an upload: the server unlocks it with a saved password and hands
 * it to the statement pipeline, then it is read and saved here. Returns what was saved.
 */
export async function processInboxItem(item: InboxItem, onProgress: (p: Progress) => void): Promise<{ kind: VaultKind; label: string }> {
  onProgress({ stage: 'unlocking' })
  const prep = await post('/admin/inbox/prepare', { id: item.id })
  const kind = prep.kind as VaultKind
  let statementId = prep.statementId as string
  let label = ''
  if (kind === 'loan') {
    onProgress({ stage: 'reading', done: 0, total: 1 })
    const parsed = parseLoanDocument(prep.lines as string[])
    if (!parsed.ok) throw new StatementError(parsed.error)
    onProgress({ stage: 'saving' })
    const saved = await post('/admin/statements/commit', { kind: 'loan', id: statementId, filename: item.filename, pages: prep.pages, parsed: parsed.doc })
    statementId = saved.statement.id
    label = parsed.doc.docType === 'schedule' ? 'Loan schedule' : 'Loan statement'
  } else {
    const file = new File([], item.filename, { type: 'application/pdf' })
    const saved = await processStatementFile({ kind, file, prepared: { id: prep.id as string, chunks: prep.chunks as number }, onProgress })
    statementId = saved.statement.id
    label = `${kind === 'card' ? 'Card' : 'Bank'} statement · ${saved.statement.txnCount} transactions`
  }
  await post('/admin/inbox/done', { id: item.id, statementId })
  return { kind, label }
}
