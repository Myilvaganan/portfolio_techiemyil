import { clearStoredToken, getStoredToken } from './adminAuth'
import type { AiInsights, Statement, StatementKind, StatementsData } from './statements'

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

export async function fetchStatements(kind: StatementKind): Promise<StatementsData> {
  const data = await api(`/admin/statements/data?kind=${kind}`)
  return { statements: data.statements ?? [], transactions: data.transactions ?? [], insights: data.insights ?? null, updatedAt: data.updatedAt }
}

export async function deleteStatement(kind: StatementKind, id: string) {
  await api(`/admin/statements?kind=${kind}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function statementFileUrl(kind: StatementKind, id: string): Promise<string> {
  const data = await api(`/admin/statements/file-url?kind=${kind}&id=${encodeURIComponent(id)}`)
  return data.url
}

export async function generateInsights(kind: StatementKind, context: unknown, fingerprint: string): Promise<AiInsights> {
  try {
    return await post('/admin/statements/insights', { kind, context, fingerprint })
  } catch (e) {
    // The strongest model can be slow on big histories; fall back to the faster one rather than failing.
    if (e instanceof StatementError && (e.code === 'ai_timeout' || e.code === 'ai_incomplete')) return post('/admin/statements/insights', { kind, context, fingerprint, fast: true })
    throw e
  }
}

export async function askAi(kind: StatementKind, question: string, context: unknown): Promise<string> {
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
  kind: StatementKind
  file: File
  password?: string
  resumeId?: string
  // Set when the file was already unlocked and saved but the AI step failed — retry skips straight to reading.
  prepared?: { id: string; chunks: number }
  onProgress: (p: Progress) => void
}

export const isPdf = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf'

// Uploads to the vault, unlocks the PDF with the one password, reads it with AI, and saves the result.
export async function processStatementFile({ kind, file, password, resumeId, prepared, onProgress }: ProcessOptions): Promise<{ statement: Statement; replaced: number }> {
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
