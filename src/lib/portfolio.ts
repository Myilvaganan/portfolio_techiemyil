export type BucketId = 'gold' | 'silver' | 'nifty50' | 'next50' | 'midcap' | 'stocks'
export type HoldingAction = 'reduce' | 'review' | 'core'

export interface Holding {
  symbol: string
  role: string
  value: number
  bucket: BucketId
  action: HoldingAction
  count?: number
  textile?: boolean
}

export interface Bucket {
  label: string
  color: string
  defaultTarget: number
}

export const BUCKET_IDS: BucketId[] = ['nifty50', 'next50', 'midcap', 'gold', 'silver', 'stocks']

export const BUCKETS: Record<BucketId, Bucket> = {
  nifty50: { label: 'Nifty 50 ETF', color: '#60a5fa', defaultTarget: 40 },
  next50: { label: 'Nifty Next 50 ETF', color: '#a78bfa', defaultTarget: 15 },
  midcap: { label: 'Midcap 150 ETF', color: '#22d3ee', defaultTarget: 15 },
  gold: { label: 'Gold ETF', color: '#fbbf24', defaultTarget: 10 },
  silver: { label: 'Silver ETF', color: '#94a3b8', defaultTarget: 5 },
  stocks: { label: 'Stocks + Cash', color: '#64748b', defaultTarget: 15 },
}

export const HOLDINGS: Holding[] = [
  { symbol: 'GOLDBEES', role: 'Gold ETF', value: 32378, bucket: 'gold', action: 'reduce' },
  { symbol: 'SILVERBEES', role: 'Silver ETF', value: 21510, bucket: 'silver', action: 'reduce' },
  { symbol: 'GOKEX', role: 'Textile', value: 5822, bucket: 'stocks', action: 'review', textile: true },
  { symbol: 'ICIL', role: 'Textile', value: 5368, bucket: 'stocks', action: 'review', textile: true },
  { symbol: 'JSWENERGY', role: 'Power', value: 5260, bucket: 'stocks', action: 'review' },
  { symbol: 'VTL', role: 'Textile', value: 4624, bucket: 'stocks', action: 'review', textile: true },
  { symbol: 'KPRMILL', role: 'Textile', value: 4565, bucket: 'stocks', action: 'review', textile: true },
  { symbol: 'ICICINIFTY', role: 'Nifty 50 ETF', value: 4772, bucket: 'nifty50', action: 'core' },
  { symbol: 'ICICINXT50', role: 'Next 50 ETF', value: 916, bucket: 'next50', action: 'core' },
  { symbol: 'Others', role: 'Mixed', value: 19062, bucket: 'stocks', action: 'review', count: 8 },
]

export const SNAPSHOT = { label: 'Sep 2026', todayPnl: 2098, todayPnlPct: 2.01, holdingCount: 17 }

export const DAILY_TARGET = 2000

export function totalValue(holdings: Holding[]) {
  return holdings.reduce((sum, h) => sum + h.value, 0)
}

export interface BucketRow {
  id: BucketId
  current: number
  currentPct: number
  targetPct: number
  target: number
  delta: number
}

export function rebalance(holdings: Holding[], targets: Record<BucketId, number>): BucketRow[] {
  const total = totalValue(holdings)
  return BUCKET_IDS.map((id) => {
    const current = holdings.filter((h) => h.bucket === id).reduce((sum, h) => sum + h.value, 0)
    const target = (total * targets[id]) / 100
    return {
      id,
      current,
      currentPct: total ? (current / total) * 100 : 0,
      targetPct: targets[id],
      target,
      delta: target - current,
    }
  })
}

export function pctOf(value: number, total: number) {
  return total ? (value / total) * 100 : 0
}

export function defaultTargets(): Record<BucketId, number> {
  return Object.fromEntries(BUCKET_IDS.map((id) => [id, BUCKETS[id].defaultTarget])) as Record<BucketId, number>
}

export function dailyReturnPct(total: number, dailyTarget = DAILY_TARGET) {
  return total ? (dailyTarget / total) * 100 : 0
}
