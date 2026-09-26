import type { VaultDocument } from './adminVault'
import type { DayNote, Trade } from './journal'
import type { HealthReport } from './health'

export type HitKind = 'page' | 'document' | 'trade' | 'note' | 'health'

export interface SearchHit {
  kind: HitKind
  title: string
  detail: string
  to: string
  /** Higher sorts first. */
  score: number
}

export interface SearchIndex {
  pages: { label: string; to: string; keywords?: string }[]
  documents: VaultDocument[]
  trades: Trade[]
  notes: Record<string, DayNote>
  reports: HealthReport[]
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

// Every query word must appear; a match at the start of the text or of a word scores higher.
function score(text: string, words: string[]): number {
  const t = norm(text)
  let total = 0
  for (const w of words) {
    const at = t.indexOf(w)
    if (at < 0) return 0
    total += at === 0 ? 3 : /[\s/_\-.#·]/.test(t[at - 1]) ? 2 : 1
  }
  return total
}

const journalLink = (date: string, account = '') => `/admin/trading-journal?date=${encodeURIComponent(date)}&book=${account ? 'forex' : 'options'}${account ? `&account=${encodeURIComponent(account)}` : ''}`

export function searchAll(index: SearchIndex, query: string, limit = 20): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: SearchHit[] = []
  const add = (h: Omit<SearchHit, 'score'>, text: string, boost = 0) => {
    const s = score(text, words)
    if (s > 0) hits.push({ ...h, score: s + boost })
  }

  for (const p of index.pages) add({ kind: 'page', title: p.label, detail: 'Open page', to: p.to }, `${p.label} ${p.keywords ?? ''}`, 2)
  for (const d of index.documents) add({ kind: 'document', title: d.filename, detail: d.tag, to: `/admin/documents?q=${encodeURIComponent(d.filename)}` }, `${d.filename} ${d.tag}`)
  for (const t of index.trades) {
    const text = [t.instrument, t.symbol, t.strategy, t.emotion, t.notes, t.direction, t.date, ...(t.mistakes ?? []), ...((t as Trade & { tags?: string[] }).tags ?? [])].join(' ')
    add({ kind: 'trade', title: `${t.instrument}${t.symbol && t.symbol !== t.instrument ? ` · ${t.symbol}` : ''}`, detail: `${t.date} · ${t.direction}${t.strategy ? ` · ${t.strategy}` : ''}`, to: journalLink(t.date, t.account) }, text)
  }
  for (const [key, n] of Object.entries(index.notes)) {
    const [date, account = ''] = key.split('#')
    const text = [n.bias, n.plan, n.review, n.lessons].join(' ')
    const snippet = (n.review || n.plan || n.lessons || n.bias).slice(0, 80)
    add({ kind: 'note', title: `Journal note · ${date}`, detail: snippet, to: journalLink(date, account) }, `${text} ${date}`)
  }
  for (const r of index.reports) {
    const date = r.testedAt.slice(0, 10)
    add({ kind: 'health', title: `InBody test · ${date}`, detail: r.values.weight !== null ? `${r.values.weight} kg` : 'Body composition', to: '/admin/health-report' }, `inbody health weight body ${date} ${r.notes}`)
  }

  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit)
}
