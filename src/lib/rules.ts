import type { Txn } from './statements'

export interface CategoryRule {
  id: string
  match: string
  category: string
}

const LOCKED = new Set(['Transfer', 'Card Payment'])

/** Plain text matches as a case-insensitive substring; "/pattern/" is treated as a regular expression. */
export function ruleMatches(match: string, t: Pick<Txn, 'merchant' | 'description'>): boolean {
  const hay = `${t.merchant} ${t.description}`
  const m = match.trim()
  if (m.length > 2 && m.startsWith('/') && m.endsWith('/')) {
    if (m.length > 82) return false
    try {
      return new RegExp(m.slice(1, -1), 'i').test(hay)
    } catch {
      return false
    }
  }
  return m.length > 0 && hay.toLowerCase().includes(m.toLowerCase())
}

/** The first rule that matches wins; transfers and card-bill payments are never re-filed. */
export function applyRules(txns: Txn[], rules: CategoryRule[]): Txn[] {
  if (!rules.length) return txns
  return txns.map((t) => {
    if (LOCKED.has(t.category)) return t
    const rule = rules.find((r) => ruleMatches(r.match, t))
    return rule && rule.category !== t.category ? { ...t, category: rule.category } : t
  })
}

/** The biggest debits still filed as Other, largest first. */
export function reviewQueue(txns: Txn[], limit = 8): Txn[] {
  return txns
    .filter((t) => t.debit > 0 && t.category === 'Other')
    .sort((a, b) => b.debit - a.debit)
    .slice(0, limit)
}

/** A short, reusable rule text for a transaction: its merchant, or failing that the first words of the description. */
export function suggestMatch(t: Pick<Txn, 'merchant' | 'description'>): string {
  const m = t.merchant.trim()
  if (m.length >= 2) return m.slice(0, 80)
  return t.description.trim().split(/\s+/).slice(0, 3).join(' ').slice(0, 80)
}
